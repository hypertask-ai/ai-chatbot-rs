declare module "playwright" {
  export interface ConsoleMessage {
    text: () => string;
    type: () => string;
  }

  export interface PageError {
    message: string;
  }

  export interface RequestFailure {
    errorText: string;
  }

  export interface Request {
    failure: () => RequestFailure | null;
    method: () => string;
    url: () => string;
  }

  export interface Route {
    abort: () => Promise<void>;
    continue: () => Promise<void>;
    request: () => Request;
  }

  export interface Response {
    status: () => number;
  }

  export interface ElementHandle {
    contentFrame: () => Promise<Frame | null>;
  }

  export interface Frame {
    evaluate: <Result>(
      callback: () => Result | Promise<Result>
    ) => Promise<Result>;
  }

  export interface Locator {
    click: (options?: { timeout?: number }) => Promise<void>;
    count: () => Promise<number>;
    elementHandle: () => Promise<ElementHandle | null>;
    first: () => Locator;
    isVisible: () => Promise<boolean>;
  }

  export interface Viewport {
    height: number;
    width: number;
  }

  export interface ContextOptions {
    deviceScaleFactor: number;
    viewport: Viewport;
  }

  export interface GotoOptions {
    timeout?: number;
    waitUntil?: "commit" | "domcontentloaded" | "load" | "networkidle";
  }

  export interface ScreenshotOptions {
    fullPage: boolean;
    path: string;
  }

  export interface Page {
    evaluate: <Result>(
      callback: () => Result | Promise<Result>
    ) => Promise<Result>;
    goto: (url: string, options?: GotoOptions) => Promise<Response | null>;
    locator: (selector: string) => Locator;
    on: (event: "console", handler: (message: ConsoleMessage) => void) => void;
    on: (event: "pageerror", handler: (error: PageError) => void) => void;
    on: (event: "requestfailed", handler: (request: Request) => void) => void;
    route: (
      pattern: string,
      handler: (route: Route) => Promise<void>
    ) => Promise<void>;
    screenshot: (options: ScreenshotOptions) => Promise<Uint8Array>;
    title: () => Promise<string>;
    url: () => string;
    waitForTimeout: (milliseconds: number) => Promise<void>;
  }

  export interface BrowserContext {
    close: () => Promise<void>;
    newPage: () => Promise<Page>;
  }

  export interface Browser {
    close: () => Promise<void>;
    newContext: (options: ContextOptions) => Promise<BrowserContext>;
  }

  export interface BrowserType {
    launch: () => Promise<Browser>;
  }

  export const chromium: BrowserType;
}

interface VerifierStyle {
  display: string;
  visibility: string;
}

interface VerifierElement {
  childElementCount: number;
  getAttribute: (name: string) => string | null;
  href: string;
  name: string;
  placeholder: string;
  querySelectorAll: (selector: string) => VerifierElement[];
  tagName: string;
  textContent: string | null;
  type: string;
}

interface VerifierFontFace {
  family: string;
  status: string;
  style: string;
  weight: string;
}

interface VerifierFontFaceSet extends Iterable<VerifierFontFace> {
  ready: Promise<unknown>;
}

interface VerifierBody {
  querySelectorAll: (selector: string) => VerifierElement[];
}

interface VerifierDocument {
  body: VerifierBody | null;
  fonts: VerifierFontFaceSet;
}

interface VerifierWindow {
  getComputedStyle: (element: VerifierElement) => VerifierStyle;
}

declare const document: VerifierDocument;

declare const window: VerifierWindow;
