import "server-only";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import { parseDocument } from "htmlparser2";
import { hasUsefulSourceText } from "./text";

const blockedHosts = [
  "x.com",
  "twitter.com",
  "t.co",
  "bsky.app",
  "threads.net",
  "mastodon.social",
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "tiktok.com",
  "reddit.com",
  "youtube.com",
  "youtu.be",
  "vimeo.com",
  "news.ycombinator.com",
  "lobste.rs",
  "wsj.com",
  "ft.com",
  "bloomberg.com",
  "economist.com",
  "nytimes.com",
  "washingtonpost.com",
  "theinformation.com",
  "archive.org",
  "archive.ph",
  "archive.is",
  "docs.google.com",
  "drive.google.com",
];
const maxBytes = 750_000;
type ArticleNode = ReturnType<typeof parseDocument>["children"][number];
export type ArticleTransport = (
  url: URL,
  signal: AbortSignal,
) => Promise<{
  status: number;
  headers: Record<string, string | undefined>;
  body: string;
}>;

export class ArticleError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

export function publicArticleHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (
    isIP(host.replace(/^\[|\]$/g, "")) !== 0 ||
    !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(host) ||
    /\.(?:local|localhost|internal|lan|home|arpa|test|invalid|example)$/.test(
      host,
    )
  )
    return false;
  return !blockedHosts.some(
    (blocked) => host === blocked || host.endsWith(`.${blocked}`),
  );
}

export function articleUrl(input: string): URL {
  if (input.length > 2048) throw new ArticleError("article_url_rejected");
  const url = new URL(input);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !publicArticleHost(url.hostname)
  )
    throw new ArticleError("publisher_not_supported");
  url.hash = "";
  return url;
}

export function publicArticleAddress(address: string): boolean {
  if (isIP(address) !== 4) return false;
  const [a, b, c] = address.split(".").map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  );
}

export async function resolveArticleAddress(
  hostname: string,
  signal: AbortSignal,
  resolver = (host: string) => lookup(host, { all: true, family: 4 }),
) {
  signal.throwIfAborted();
  const records = await new Promise<Awaited<ReturnType<typeof resolver>>>(
    (resolve, reject) => {
      const abort = () => reject(new ArticleError("article_timeout"));
      signal.addEventListener("abort", abort, { once: true });
      resolver(hostname)
        .then(resolve, reject)
        .finally(() => signal.removeEventListener("abort", abort));
    },
  );
  if (
    !records.length ||
    records.some((row) => !publicArticleAddress(row.address))
  )
    throw new ArticleError("article_address_rejected");
  return records[0].address;
}

const networkTransport: ArticleTransport = async (url, signal) => {
  const address = await resolveArticleAddress(url.hostname, signal);
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        agent: false,
        signal,
        family: 4,
        lookup: (_hostname, _options, callback) => callback(null, address, 4),
        headers: {
          "User-Agent": "devup/0.1 (technology-news newsletter)",
          Accept: "text/html",
          "Accept-Encoding": "identity",
        },
      },
      (response) => {
        const headers = {
          location: response.headers.location,
          "content-type": response.headers["content-type"],
          "content-encoding": response.headers["content-encoding"],
        };
        const status = response.statusCode ?? 0;
        response.on("error", reject);
        response.on("aborted", () =>
          reject(new ArticleError("article_incomplete")),
        );
        if (status >= 300 && status < 400) {
          response.destroy();
          resolve({ status, headers, body: "" });
          return;
        }
        if (Number(response.headers["content-length"]) > maxBytes) {
          response.destroy(new ArticleError("article_too_large"));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes)
            response.destroy(new ArticleError("article_too_large"));
          else chunks.push(chunk);
        });
        response.on("end", () =>
          resolve({
            status,
            headers,
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
};

function children(node: ArticleNode): ArticleNode[] {
  return "children" in node ? node.children : [];
}

function excluded(node: ArticleNode): boolean {
  if (!("attribs" in node)) return false;
  return (
    /^(script|style|nav|footer|header|aside|form|noscript|svg|button)$/.test(
      node.name,
    ) ||
    /(?:^|[\s_-])(cookie|comments?|sidebar|newsletter|advertisement|social|navigation)(?:$|[\s_-])/i.test(
      `${node.attribs.id ?? ""} ${node.attribs.class ?? ""}`,
    ) ||
    node.attribs["aria-hidden"] === "true" ||
    "hidden" in node.attribs
  );
}

export function extractArticle(html: string): string {
  if (Buffer.byteLength(html) > maxBytes)
    throw new ArticleError("article_too_large");
  const document = parseDocument(html);
  const stack = [...document.children];
  const articles: ArticleNode[] = [];
  const mains: ArticleNode[] = [];
  const containers: ArticleNode[] = [];
  const bodies: ArticleNode[] = [];
  let count = 0;
  while (stack.length) {
    const node = stack.pop()!;
    if (++count > 50_000) throw new ArticleError("article_too_complex");
    if (excluded(node)) continue;
    if ("attribs" in node) {
      const className = node.attribs.class ?? "";
      if (
        node.name === "article" ||
        node.attribs.itemprop === "articleBody" ||
        /(?:^|\s)markdown-body(?:\s|$)/.test(className)
      )
        articles.push(node);
      else if (node.name === "main" || node.attribs.role === "main")
        mains.push(node);
      else if (
        /(?:^|\s)(?:post|entry|article|blog|story)[-_]?(?:content|body|text)?(?:\s|$)|(?:^|\s)(?:content|prose|e-content|post|entry)(?:\s|$)/i.test(
          className,
        )
      )
        containers.push(node);
      else if (node.name === "body") bodies.push(node);
    }
    stack.push(...children(node).slice().reverse());
  }
  const readable = (root: ArticleNode): string => {
    const pending = [root];
    const parts: string[] = [];
    while (pending.length) {
      const node = pending.pop()!;
      if (excluded(node)) continue;
      if (node.type === "text") parts.push(node.data);
      else {
        if ("name" in node && /^(p|div|br|li|h[1-6]|section)$/.test(node.name))
          parts.push(" ");
        pending.push(...children(node).slice().reverse());
      }
    }
    return parts.join("").replace(/\s+/g, " ").trim();
  };
  for (const tier of [articles, mains, containers, bodies]) {
    const best = tier
      .map(readable)
      .filter(hasUsefulSourceText)
      .sort((a, b) => b.length - a.length)[0];
    if (best) return best.slice(0, 12_000);
  }
  throw new ArticleError("article_unreadable");
}

export async function readArticle(
  input: string,
  signal: AbortSignal,
  transport: ArticleTransport = networkTransport,
): Promise<string> {
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(8000)]);
  let url = articleUrl(input);
  for (let redirect = 0; redirect <= 2; redirect++) {
    deadline.throwIfAborted();
    const response = await transport(url, deadline);
    deadline.throwIfAborted();
    if (
      [301, 302, 303, 307, 308].includes(response.status) &&
      response.headers.location
    ) {
      url = articleUrl(new URL(response.headers.location, url).href);
      continue;
    }
    if (response.status !== 200)
      throw new ArticleError(`article_http_${response.status}`);
    if (
      !/^text\/html(?:;|$)/i.test(response.headers["content-type"] ?? "") ||
      ![undefined, "identity"].includes(response.headers["content-encoding"])
    )
      throw new ArticleError("article_content_type");
    return extractArticle(response.body);
  }
  throw new ArticleError("article_redirect_limit");
}
