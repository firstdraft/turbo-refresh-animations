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
  buildNewBody,
} from "./helpers.js"

// Import the library (installs event listeners on first import)
import "../turbo-refresh-animations.js"

function setLocation(path) {
  window.history.replaceState({}, "", path)
}

function samePageRefreshSetup(newBody) {
  const url = window.location.href
  dispatchTurboVisit(url, "replace")
  dispatchTurboBeforeRender(newBody)
}

describe("data-turbo-refresh-preserve protection", () => {
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

  describe("during same-page refresh morphs (no initiator)", () => {
    it("prevents morphing of permanent elements", () => {
      const el = document.createElement("div")
      el.id = "form-wrapper"
      el.setAttribute("data-turbo-refresh-preserve", "")
      container.appendChild(el)

      const newEl = document.createElement("div")
      newEl.id = "form-wrapper"

      const newBody = buildNewBody('<div id="form-wrapper"></div>')
      samePageRefreshSetup(newBody)

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
      samePageRefreshSetup(newBody)

      const morphEvent = dispatchTurboBeforeMorphElement(el, newEl)
      expect(morphEvent.defaultPrevented).toBe(false)
    })

    it("allows removal of permanent elements (newElement is undefined)", () => {
      const el = document.createElement("div")
      el.id = "form-wrapper"
      el.setAttribute("data-turbo-refresh-preserve", "")
      container.appendChild(el)

      const newBody = buildNewBody("")
      samePageRefreshSetup(newBody)

      const morphEvent = dispatchTurboBeforeMorphElement(el, undefined)
      expect(morphEvent.defaultPrevented).toBe(false)
    })

    it("protects multiple permanent elements simultaneously", () => {
      const el1 = document.createElement("div")
      el1.id = "form-1"
      el1.setAttribute("data-turbo-refresh-preserve", "")
      container.appendChild(el1)

      const el2 = document.createElement("div")
      el2.id = "form-2"
      el2.setAttribute("data-turbo-refresh-preserve", "")
      container.appendChild(el2)

      const newBody = buildNewBody(
        '<div id="form-1"></div><div id="form-2"></div>'
      )
      samePageRefreshSetup(newBody)

      const morph1 = dispatchTurboBeforeMorphElement(el1, document.createElement("div"))
      const morph2 = dispatchTurboBeforeMorphElement(el2, document.createElement("div"))

      expect(morph1.defaultPrevented).toBe(true)
      expect(morph2.defaultPrevented).toBe(true)
    })
  })

  describe("during user-initiated form submission", () => {
    it("allows morphing of the submitter's permanent element", () => {
      const el = document.createElement("div")
      el.id = "form-wrapper"
      el.setAttribute("data-turbo-refresh-preserve", "")
      container.appendChild(el)

      const form = document.createElement("form")
      el.appendChild(form)

      dispatchTurboSubmitStart(form)

      const newEl = document.createElement("div")
      newEl.id = "form-wrapper"
      const newBody = buildNewBody('<div id="form-wrapper"></div>')
      samePageRefreshSetup(newBody)

      const morphEvent = dispatchTurboBeforeMorphElement(el, newEl)
      expect(morphEvent.defaultPrevented).toBe(false)
    })

    it("still protects OTHER permanent elements when one submits", () => {
      const el1 = document.createElement("div")
      el1.id = "form-1"
      el1.setAttribute("data-turbo-refresh-preserve", "")
      container.appendChild(el1)

      const el2 = document.createElement("div")
      el2.id = "form-2"
      el2.setAttribute("data-turbo-refresh-preserve", "")
      container.appendChild(el2)

      const form = document.createElement("form")
      el1.appendChild(form)

      dispatchTurboSubmitStart(form)

      const newBody = buildNewBody(
        '<div id="form-1"></div><div id="form-2"></div>'
      )
      samePageRefreshSetup(newBody)

      const morph1 = dispatchTurboBeforeMorphElement(
        el1,
        document.createElement("div")
      )
      const morph2 = dispatchTurboBeforeMorphElement(
        el2,
        document.createElement("div")
      )

      expect(morph1.defaultPrevented).toBe(false) // submitter morphs
      expect(morph2.defaultPrevented).toBe(true)  // other stays protected
    })

    it("clears submitter tracking when response is a Turbo Stream", () => {
      const el = document.createElement("div")
      el.id = "form-wrapper"
      el.setAttribute("data-turbo-refresh-preserve", "")
      container.appendChild(el)

      const form = document.createElement("form")
      el.appendChild(form)

      dispatchTurboSubmitStart(form)
      dispatchTurboSubmitEnd(form, { contentType: "text/vnd.turbo-stream.html" })

      // After a Turbo Stream response, the submitter tracking is cleared.
      // A subsequent same-page morph should protect the element.
      const newBody = buildNewBody('<div id="form-wrapper"></div>')
      samePageRefreshSetup(newBody)

      const morphEvent = dispatchTurboBeforeMorphElement(el, document.createElement("div"))
      expect(morphEvent.defaultPrevented).toBe(true)
    })
  })

  describe("during user-initiated link click", () => {
    it("allows morphing of the permanent element containing the clicked link", () => {
      const el = document.createElement("div")
      el.id = "item-wrapper"
      el.setAttribute("data-turbo-refresh-preserve", "")
      container.appendChild(el)

      const link = document.createElement("a")
      link.href = "/items"
      el.appendChild(link)

      dispatchTurboClick(link, window.location.href)

      const newEl = document.createElement("div")
      newEl.id = "item-wrapper"
      const newBody = buildNewBody('<div id="item-wrapper"></div>')
      samePageRefreshSetup(newBody)

      const morphEvent = dispatchTurboBeforeMorphElement(el, newEl)
      expect(morphEvent.defaultPrevented).toBe(false)
    })
  })

  describe("during cross-page navigation", () => {
    it("does not protect permanent elements (not a same-page morph)", () => {
      const el = document.createElement("div")
      el.id = "form-wrapper"
      el.setAttribute("data-turbo-refresh-preserve", "")
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

  describe("version flash on protected elements", () => {
    it("updates version attribute when version changes on a protected element", () => {
      const el = document.createElement("div")
      el.id = "item-1"
      el.setAttribute("data-turbo-refresh-preserve", "")
      el.setAttribute("data-turbo-refresh-animate", "")
      el.setAttribute("data-turbo-refresh-version", "v1")
      container.appendChild(el)

      const newEl = document.createElement("div")
      newEl.id = "item-1"
      newEl.setAttribute("data-turbo-refresh-version", "v2")

      const newBody = buildNewBody(
        '<div id="item-1" data-turbo-refresh-version="v2"></div>'
      )
      samePageRefreshSetup(newBody)

      const morphEvent = dispatchTurboBeforeMorphElement(el, newEl)
      expect(morphEvent.defaultPrevented).toBe(true)
      expect(el.getAttribute("data-turbo-refresh-version")).toBe("v2")
    })

    it("does not flash when version is unchanged", () => {
      const el = document.createElement("div")
      el.id = "item-1"
      el.setAttribute("data-turbo-refresh-preserve", "")
      el.setAttribute("data-turbo-refresh-animate", "")
      el.setAttribute("data-turbo-refresh-version", "v1")
      container.appendChild(el)

      const newEl = document.createElement("div")
      newEl.id = "item-1"
      newEl.setAttribute("data-turbo-refresh-version", "v1")

      const newBody = buildNewBody(
        '<div id="item-1" data-turbo-refresh-version="v1"></div>'
      )
      samePageRefreshSetup(newBody)

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
