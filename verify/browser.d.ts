interface ComputedStyle {
  display: string;
  visibility: string;
}

interface PageElement {
  childElementCount: number;
  getAttribute: (name: string) => string | null;
  href: string;
  name: string;
  placeholder: string;
  querySelectorAll: (selector: string) => PageElement[];
  tagName: string;
  textContent: string | null;
  type: string;
}

interface PageFontFace {
  family: string;
  status: string;
  style: string;
  weight: string;
}

interface PageFontFaceSet extends Iterable<PageFontFace> {
  ready: Promise<unknown>;
}

interface PageBody {
  querySelectorAll: (selector: string) => PageElement[];
}

interface PageDocument {
  body: PageBody | null;
  fonts: PageFontFaceSet;
}

interface PageWindow {
  getComputedStyle: (element: PageElement) => ComputedStyle;
}

declare const document: PageDocument;

declare const window: PageWindow;
