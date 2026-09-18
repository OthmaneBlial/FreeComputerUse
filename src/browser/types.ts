import type { SemanticTarget } from '../actions/schema.js';
export interface PageElement {
  ref: string; tag: string; role: string; name: string; label?: string;
  type?: string; required?: boolean; disabled?: boolean; hasValue?: boolean;
  checked?: boolean; options?: string[]; error?: string; form?: string;
  frame: number; selectors: SemanticTarget;
  path: string; region?: string; href?: string;
}
export interface PageState {
  url: string; title: string; headings: string[]; text: string;
  elements: PageElement[]; tables: string[][][]; dialogs: string[];
  htmlBytes: number; hash: string; warnings: string[];
  frames: { index: number; url: string }[]; truncated: boolean;
}
