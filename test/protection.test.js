import { describe, it, expect, beforeEach, afterEach } from "vitest"
// Import helpers FIRST so CSS.escape polyfill is in place before the library loads
import {
  dispatchTurboVisit,
  dispatchTurboBeforeRender,
  dispatchTurboBeforeMorphElement,
  dispatchTurboRender,
  dispatchTurboSubmitStart,
  dispatchTurboSubmitEnd,
  dispatchTurboClick,
  dispatchTurboBeforeCache,
  dispatchTurboBeforeStreamRender,
  buildNewBody,
} from "./helpers.js"

// Import the library (installs event listeners on first import)
import "../turbo-refresh-animations.js"

function setLocation(path) {
  window.history.replaceState({}, "", path)
}

// Simulate a same-page refresh morph triggered by an external stream.
// Stream refreshes: turbo:before-stream-render → (debounce) → turbo:visit → turbo:before-render
function streamRefreshSetup(newBody) {
  dispatchTurboBeforeStreamRender("refresh")
  const url = window.location.href
  dispatchTurboVisit(url, "replace")
  dispatchTurboBeforeRender(newBody)
}

// Simulate a same-page refresh morph triggered by user navigation (e.g., form submit redirect).
function userRefreshSetup(newBody) {
  const url = window.location.href
  dispatchTurboVisit(url, "replace")
  dispatchTurboBeforeRender(newBody)
}

describe("data-turbo-refresh-stream-permanent protection", () => {
  let container

  beforeEach(() => {
    setLocation("/items")
    dispatchTurboRender()

    container = document.createElement("div")
    document.body.appendChild(container)
  })

  afterEach(() => {
    container.remove()
    dispatchTurboRender()
  })

  describe("during stream-initiated refresh (external)", () => {
    it("prevents morphing of permanent elements", () => {
      const el = document.createElement("div")
      el.id = "form-wrapper"
      el.setAttribute("data-turbo-refresh-stream-permanent", "")
      container.appendChild(el)

      const newEl = document.createElement("div")
      newEl.id = "form-wrapper"

      const newBody = buildNewBody('<div id="form-wrapper"></div>')
      streamRefreshSetup(newBody)

      const morphEvent = dispatchTurboBeforeMorphElement(el, newEl)
      expect(morphEvent.defaultPrevented).toBe(true)
    })

    it("allows morphing of non-permanent elements", () => {
      const el = document.createElement("div")
      el.id = "regular-el"
      container.appendChild(el)

      const newEl = document.createElement("div")
      newEl.id = "regular-el"

      const newBody = buildNewBody('<div id="regular-el"></div>')
      streamRefreshSetup(newBody)

      const morphEvent = dispatchTurboBeforeMorphElement(el, newEl)
      expect(morphEvent.defaultPrevented).toBe(false)
    })

    it("allows removal of permanent elements (newElement is undefined)", () => {
      const el = document.createElement("div")
      el.id = "form-wrapper"
      el.setAttribute("data-turbo-refresh-stream-permanent", "")
      container.appendChild(el)

      const newBody = buildNewBody("")
      streamRefreshSetup(newBody)

      const morphEvent = dispatchTurboBeforeMorphElement(el, undefined)
      expect(morphEvent.defaultPrevented).toBe(false)
    })

    it("protects multiple permanent elements simultaneously", () => {
      const el1 = document.createElement("div")
      el1.id = "form-1"
      el1.setAttribute("data-turbo-refresh-stream-permanent", "")
      container.appendChild(el1)

      const el2 = document.createElement("div")
      el2.id = "form-2"
      el2.setAttribute("data-turbo-refresh-stream-permanent", "")
      container.appendChild(el2)

      const newBody = buildNewBody(
        '<div id="form-1"></div><div id="form-2"></div>'
      )
      streamRefreshSetup(newBody)

      const morph1 = dispatchTurboBeforeMorphElement(el1, document.createElement("div"))
      const morph2 = dispatchTurboBeforeMorphElement(el2, document.createElement("div"))

      expect(morph1.defaultPrevented).toBe(true)
      expect(morph2.defaultPrevented).toBe(true)
    })
  })

  describe("during user-initiated form submission", () => {
    it("allows morphing of all elements (including permanent ones)", () => {
      const el = document.createElement("div")
      el.id = "form-wrapper"
      el.setAttribute("data-turbo-refresh-stream-permanent", "")
      container.appendChild(el)

      const form = document.createElement("form")
      el.appendChild(form)

      dispatchTurboSubmitStart(form)

      const newEl = document.createElement("div")
      newEl.id = "form-wrapper"
      const newBody = buildNewBody('<div id="form-wrapper"></div>')
      userRefreshSetup(newBody)

      const morphEvent = dispatchTurboBeforeMorphElement(el, newEl)
      expect(morphEvent.defaultPrevented).toBe(false)
    })

    it("ignores own broadcast that arrives after submit but before redirect morph", () => {
      const el = document.createElement("div")
      el.id = "form-wrapper"
      el.setAttribute("data-turbo-refresh-stream-permanent", "")
      container.appendChild(el)

      const form = document.createElement("form")
      el.appendChild(form)

      // User submits form
      dispatchTurboSubmitStart(form)
      // Own broadcast arrives via WebSocket DURING the fetch (before Turbo dedupes it)
      dispatchTurboBeforeStreamRender("refresh")

      const newBody = buildNewBody('<div id="form-wrapper"></div>')
      userRefreshSetup(newBody)

      // The form should still morph (clear) because it's user-initiated
      const morphEvent = dispatchTurboBeforeMorphElement(el, document.createElement("div"))
      expect(morphEvent.defaultPrevented).toBe(false)
    })

    it("clears stream flag if stream arrived just before submit", () => {
      const el = document.createElement("div")
      el.id = "form-wrapper"
      el.setAttribute("data-turbo-refresh-stream-permanent", "")
      container.appendChild(el)

      const form = document.createElement("form")
      el.appendChild(form)

      // Stream arrives, then user submits before the debounced visit fires
      dispatchTurboBeforeStreamRender("refresh")
      dispatchTurboSubmitStart(form)

      const newBody = buildNewBody('<div id="form-wrapper"></div>')
      userRefreshSetup(newBody)

      const morphEvent = dispatchTurboBeforeMorphElement(el, document.createElement("div"))
      expect(morphEvent.defaultPrevented).toBe(false)
    })
  })

  describe("during user-initiated link click", () => {
    it("allows morphing of all elements (including permanent ones)", () => {
      const el = document.createElement("div")
      el.id = "item-wrapper"
      el.setAttribute("data-turbo-refresh-stream-permanent", "")
      container.appendChild(el)

      const link = document.createElement("a")
      link.href = "/items"
      el.appendChild(link)

      dispatchTurboClick(link, window.location.href)

      const newEl = document.createElement("div")
      newEl.id = "item-wrapper"
      const newBody = buildNewBody('<div id="item-wrapper"></div>')
      userRefreshSetup(newBody)

      const morphEvent = dispatchTurboBeforeMorphElement(el, newEl)
      expect(morphEvent.defaultPrevented).toBe(false)
    })

    it("clears stream flag if stream arrived just before click", () => {
      const el = document.createElement("div")
      el.id = "item-wrapper"
      el.setAttribute("data-turbo-refresh-stream-permanent", "")
      container.appendChild(el)

      const link = document.createElement("a")
      link.href = "/items"
      el.appendChild(link)

      dispatchTurboBeforeStreamRender("refresh")
      dispatchTurboClick(link, window.location.href)

      const newBody = buildNewBody('<div id="item-wrapper"></div>')
      userRefreshSetup(newBody)

      const morphEvent = dispatchTurboBeforeMorphElement(el, document.createElement("div"))
      expect(morphEvent.defaultPrevented).toBe(false)
    })
  })

  describe("after Turbo Stream link click (no page navigation)", () => {
    it("does not leave userNavigationInProgress stuck", () => {
      const el = document.createElement("div")
      el.id = "edit-form"
      el.setAttribute("data-turbo-refresh-stream-permanent", "")
      container.appendChild(el)

      // User clicks a data-turbo-stream link (e.g., Edit button).
      // This results in a Turbo Stream response, not a page navigation,
      // so turbo:render never fires.
      const link = document.createElement("a")
      link.href = "/items/1/edit"
      link.setAttribute("data-turbo-stream", "")
      el.appendChild(link)

      dispatchTurboClick(link, "/items/1/edit")

      // Later, an external stream refresh arrives
      const newBody = buildNewBody('<div id="edit-form"></div>')
      streamRefreshSetup(newBody)

      const morphEvent = dispatchTurboBeforeMorphElement(el, document.createElement("div"))
      expect(morphEvent.defaultPrevented).toBe(true)
    })
  })

  describe("after Turbo Stream form response", () => {
    it("clears userNavigationInProgress on turbo_stream response", () => {
      const el = document.createElement("div")
      el.id = "form-wrapper"
      el.setAttribute("data-turbo-refresh-stream-permanent", "")
      container.appendChild(el)

      const form = document.createElement("form")
      el.appendChild(form)

      // User submits form, server responds with Turbo Stream (not redirect)
      dispatchTurboSubmitStart(form)
      dispatchTurboSubmitEnd(form, { contentType: "text/vnd.turbo-stream.html" })

      // Later, an external stream refresh arrives
      const newBody = buildNewBody('<div id="form-wrapper"></div>')
      streamRefreshSetup(newBody)

      const morphEvent = dispatchTurboBeforeMorphElement(el, document.createElement("div"))
      expect(morphEvent.defaultPrevented).toBe(true)
    })
  })

  describe("during cross-page navigation", () => {
    it("does not protect permanent elements (not a same-page morph)", () => {
      const el = document.createElement("div")
      el.id = "form-wrapper"
      el.setAttribute("data-turbo-refresh-stream-permanent", "")
      container.appendChild(el)

      const newEl = document.createElement("div")
      newEl.id = "form-wrapper"

      const newBody = buildNewBody('<div id="form-wrapper"></div>')
      dispatchTurboVisit("http://localhost/other-page", "replace")
      dispatchTurboBeforeRender(newBody)

      const morphEvent = dispatchTurboBeforeMorphElement(el, newEl)
      expect(morphEvent.defaultPrevented).toBe(false)
    })
  })

  describe("non-refresh stream actions", () => {
    it("does not set stream flag for non-refresh stream actions", () => {
      const el = document.createElement("div")
      el.id = "form-wrapper"
      el.setAttribute("data-turbo-refresh-stream-permanent", "")
      container.appendChild(el)

      // A "replace" stream action (not "refresh") should not trigger protection
      dispatchTurboBeforeStreamRender("replace")

      const newBody = buildNewBody('<div id="form-wrapper"></div>')
      userRefreshSetup(newBody)

      const morphEvent = dispatchTurboBeforeMorphElement(el, document.createElement("div"))
      expect(morphEvent.defaultPrevented).toBe(false)
    })
  })

  describe("version flash on protected elements", () => {
    it("updates version attribute when version changes on a protected element", () => {
      const el = document.createElement("div")
      el.id = "item-1"
      el.setAttribute("data-turbo-refresh-stream-permanent", "")
      el.setAttribute("data-turbo-refresh-animate", "")
      el.setAttribute("data-turbo-refresh-version", "v1")
      container.appendChild(el)

      const newEl = document.createElement("div")
      newEl.id = "item-1"
      newEl.setAttribute("data-turbo-refresh-version", "v2")

      const newBody = buildNewBody(
        '<div id="item-1" data-turbo-refresh-version="v2"></div>'
      )
      streamRefreshSetup(newBody)

      const morphEvent = dispatchTurboBeforeMorphElement(el, newEl)
      expect(morphEvent.defaultPrevented).toBe(true)
      expect(el.getAttribute("data-turbo-refresh-version")).toBe("v2")
    })

    it("does not flash when version is unchanged", () => {
      const el = document.createElement("div")
      el.id = "item-1"
      el.setAttribute("data-turbo-refresh-stream-permanent", "")
      el.setAttribute("data-turbo-refresh-animate", "")
      el.setAttribute("data-turbo-refresh-version", "v1")
      container.appendChild(el)

      const newEl = document.createElement("div")
      newEl.id = "item-1"
      newEl.setAttribute("data-turbo-refresh-version", "v1")

      const newBody = buildNewBody(
        '<div id="item-1" data-turbo-refresh-version="v1"></div>'
      )
      streamRefreshSetup(newBody)

      dispatchTurboBeforeMorphElement(el, newEl)
      expect(el.classList.contains("turbo-refresh-change")).toBe(false)
    })
  })
})

describe("turbo:before-cache cleanup", () => {
  it("removes animation classes before caching", () => {
    const el = document.createElement("div")
    el.id = "item-1"
    el.setAttribute("data-turbo-refresh-animate", "")
    el.classList.add("turbo-refresh-enter")
    el.classList.add("turbo-refresh-change")
    document.body.appendChild(el)

    dispatchTurboBeforeCache()

    expect(el.classList.contains("turbo-refresh-enter")).toBe(false)
    expect(el.classList.contains("turbo-refresh-change")).toBe(false)

    el.remove()
  })
})
