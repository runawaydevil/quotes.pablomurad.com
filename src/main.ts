import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/components.css";

import { copy } from "./config";
import { fieldForId, formatCopyText } from "./lib/quote-utils";
import type { Field } from "./lib/quote-utils";
import { getNextQuote } from "./services/quotes";
import type { Quote } from "./types/quote";

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`Missing required element #${id}`);
  return element as T;
}

const line = requireElement<HTMLElement>("line");
const lineLoading = requireElement<HTMLParagraphElement>("line-loading");
const quoteText = requireElement<HTMLParagraphElement>("quote-text");
const quoteAuthor = requireElement<HTMLElement>("quote-author");
const status = requireElement<HTMLParagraphElement>("status");
const btnAnother = requireElement<HTMLButtonElement>("btn-another");
const btnCopy = requireElement<HTMLButtonElement>("btn-copy");
const themeColor = document.querySelector('meta[name="theme-color"]');

const LENGTH_TIERS = { short: 80, medium: 160 } as const;

let currentQuote: Quote | null = null;
let currentField: Field | null = null;
let loading = false;
let feedbackTimer: number | undefined;

function setControlsEnabled(enabled: boolean): void {
  btnAnother.disabled = !enabled;
  btnCopy.disabled = !enabled;
}

function applyField(field: Field): void {
  currentField = field;
  document.documentElement.style.setProperty("--field", field.bg);
  document.documentElement.style.setProperty("--ink", field.ink);
  themeColor?.setAttribute("content", field.bg);
}

function setLoading(isLoading: boolean): void {
  loading = isLoading;
  line.setAttribute("aria-busy", String(isLoading));
  if (currentQuote === null) {
    lineLoading.hidden = !isLoading;
  } else {
    lineLoading.hidden = true;
  }
  setControlsEnabled(!isLoading && currentQuote !== null);
}

function announce(message: string): void {
  status.textContent = "";
  window.setTimeout(() => {
    status.textContent = message;
  }, 30);
}

function clearFeedback(): void {
  window.clearTimeout(feedbackTimer);
  feedbackTimer = undefined;
  btnCopy.textContent = copy.buttons.copy;
}

function showFeedback(button: HTMLButtonElement, doneLabel: string): void {
  clearFeedback();
  button.textContent = doneLabel;
  announce(doneLabel);
  feedbackTimer = window.setTimeout(clearFeedback, 1600);
}

function lengthTierFor(text: string): keyof typeof LENGTH_TIERS | "long" {
  if (text.length <= LENGTH_TIERS.short) return "short";
  if (text.length <= LENGTH_TIERS.medium) return "medium";
  return "long";
}

function renderQuote(quote: Quote): void {
  currentQuote = quote;
  quoteText.textContent = quote.text;
  quoteAuthor.textContent = quote.author;
  line.dataset.length = lengthTierFor(quote.text);
  applyField(fieldForId(quote.id, currentField?.name));

  line.classList.remove("line--enter");
  void line.offsetWidth;
  line.classList.add("line--enter");
}

async function loadQuote(): Promise<void> {
  if (loading) return;
  clearFeedback();
  setLoading(true);
  try {
    const { quote } = await getNextQuote(currentQuote?.id);
    renderQuote(quote);
  } catch {
    if (currentQuote === null) {
      quoteText.textContent = copy.errorLabel;
      quoteAuthor.textContent = "";
    }
    announce(copy.errorLabel);
  } finally {
    setLoading(false);
  }
}

async function writeToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const scratch = document.createElement("textarea");
      scratch.value = text;
      scratch.style.position = "fixed";
      scratch.style.opacity = "0";
      document.body.append(scratch);
      scratch.select();
      const ok = document.execCommand("copy");
      scratch.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

async function copyCurrentQuote(): Promise<void> {
  if (currentQuote === null || loading) return;
  const copied = await writeToClipboard(formatCopyText(currentQuote));
  showFeedback(btnCopy, copied ? copy.buttons.copyDone : copy.buttons.copyFailed);
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    target.closest('button, a, input, textarea, select, [contenteditable="true"]') !== null
  );
}

function hasTextSelection(): boolean {
  return (window.getSelection()?.toString().length ?? 0) > 0;
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    clearFeedback();
    return;
  }
  if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
  if (isInteractiveTarget(event.target) || hasTextSelection()) return;
  if (event.key === " " || event.key === "ArrowRight") {
    event.preventDefault();
    void loadQuote();
  } else if (event.key === "c" || event.key === "C") {
    void copyCurrentQuote();
  }
}

btnAnother.addEventListener("click", () => void loadQuote());
btnCopy.addEventListener("click", () => void copyCurrentQuote());
document.addEventListener("keydown", onKeydown);

void loadQuote();
