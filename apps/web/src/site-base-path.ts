export const normalizeBasePath = (value = ""): string => {
  const trimmed = value.trim();

  if (trimmed === "" || trimmed === "/") {
    return "";
  }

  const rooted = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;

  return rooted.replace(/\/+$/u, "");
};

export const siteBasePath = normalizeBasePath("/ratstack");

export const stripBasePath = (
  pathname: string,
  basePath: string = siteBasePath
): string | undefined => {
  if (basePath === "") {
    return pathname;
  }

  if (pathname === basePath || pathname === `${basePath}/`) {
    return "/";
  }

  return pathname.startsWith(`${basePath}/`)
    ? pathname.slice(basePath.length)
    : undefined;
};

export const siteNoindexValue = (
  basePath: string = siteBasePath
): string | undefined => (basePath === "" ? undefined : "noindex");

export const siteRobotsMeta = (basePath: string = siteBasePath): string => {
  const value = siteNoindexValue(basePath);

  return value === undefined ? "" : `<meta name="robots" content="${value}">`;
};

export const siteAssetHeaders = (
  basePath: string = siteBasePath
): string | undefined => {
  const value = siteNoindexValue(basePath);

  return value === undefined
    ? undefined
    : `${basePath}/*\n  X-Robots-Tag: ${value}\n`;
};
