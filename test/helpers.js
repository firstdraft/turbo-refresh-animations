// Polyfill CSS.escape for jsdom (not implemented there)
if (typeof globalThis.CSS === "undefined") {
  globalThis.CSS = {}
}
if (typeof CSS.escape !== "function") {
  CSS.escape = function (value) {
    return String(value).replace(/([^\w-])/g, "\\$1")
  }
}

// Helpers for simulating Turbo event sequences in tests.
//
// Turbo dispatches events on `document` during its lifecycle. The library
// under test listens to these events to decide what to animate and what to
// protect. These helpers replay the relevant event sequences so we can
// assert on the outcomes (e.g., whether `preventDefault` was called on
// `turbo:before-morph-element`).

export function dispatchTurboVisit(url, action = "replace") {
  document.dispatchEvent(
    new CustomEvent("turbo:visit", {
      detail: { url, action },
    })
  )
}

export function dispatchTurboBeforeRender(newBody) {
  const event = new CustomEvent("turbo:before-render", {
    cancelable: true,
    detail: {
      newBody,
      resume: () => {},
    },
  })
  document.dispatchEvent(event)
  return event
}

export function dispatchTurboBeforeMorphElement(currentEl, newEl) {
  const event = new CustomEvent("turbo:before-morph-element", {
    bubbles: true,
    cancelable: true,
    detail: { newElement: newEl },
  })
  // Turbo dispatches this on the element; it bubbles to document where the library listens
  currentEl.dispatchEvent(event)
  return event
}

export function dispatchTurboRender() {
  document.dispatchEvent(new CustomEvent("turbo:render"))
}

export function dispatchTurboSubmitStart(formEl) {
  const event = new CustomEvent("turbo:submit-start", {
    bubbles: true,
  })
  formEl.dispatchEvent(event)
}

export function dispatchTurboSubmitEnd(formEl, { contentType = "text/html" } = {}) {
  const event = new CustomEvent("turbo:submit-end", {
    bubbles: true,
    detail: {
      fetchResponse: { contentType },
    },
  })
  formEl.dispatchEvent(event)
}

export function dispatchTurboClick(linkEl, url) {
  const event = new CustomEvent("turbo:click", {
    bubbles: true,
    detail: { url },
  })
  linkEl.dispatchEvent(event)
  return event
}

export function dispatchTurboBeforeCache() {
  document.dispatchEvent(new CustomEvent("turbo:before-cache"))
}

// Build a minimal newBody for turbo:before-render
export function buildNewBody(innerHTML) {
  const body = document.createElement("body")
  body.innerHTML = innerHTML
  return body
}
