export const embedOrigins = [
  "https://hypertask.ai",
  "https://www.hypertask.ai",
  "https://docs.hypertask.ai",
] as const;

export const embedOrigin = (origin: string | null): string | null =>
  origin !== null && embedOrigins.some((allowed) => allowed === origin)
    ? origin
    : null;

const preflight = (request: Request): boolean => request.method === "OPTIONS";

export const corsHeaders = (request: Request): Headers => {
  const headers = new Headers();
  const origin = embedOrigin(request.headers.get("origin"));

  headers.set(
    "vary",
    preflight(request) ? "Origin, Access-Control-Request-Headers" : "Origin"
  );

  if (origin !== null) {
    headers.set("access-control-allow-origin", origin);
  }

  if (preflight(request)) {
    headers.set("access-control-allow-headers", "Content-Type,Authorization");
    headers.set("access-control-allow-methods", "GET,POST,OPTIONS");
  }

  return headers;
};

export const withCors = (request: Request, response: Response): Response => {
  const headers = new Headers(response.headers);

  for (const [name, value] of corsHeaders(request)) {
    headers.set(name, value);
  }

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
};
