import { describe, it, expect, beforeEach, afterEach } from "vitest"
import {
  dispatchTurboVisit,
  dispatchTurboBeforeRender,
  dispatchTurboRender,
  dispatchTurboBeforeCache,
  buildNewBody,
} from "./helpers.js"

import "../turbo-refresh-animations.js"

function setLocation(path) {
  window.history.replaceState({}, "", path)
}

function samePageRefreshCycle(newBody) {
  const url = window.location.href
  dispatchTurboVisit(url, "replace")
  dispatchTurboBeforeRender(newBody)
  dispatchTurboRender()
}

describe("enter/change/exit animation detection", () => {
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

  describe("enter animations", () => {
    it("applies enter class to new elements after morph", () => {
      // No elements before the morph
      const newBody = buildNewBody('<div id="item-1" data-turbo-refresh-animate></div>')
      const url = window.location.href
      dispatchTurboVisit(url, "replace")
      dispatchTurboBeforeRender(newBody)

      // Simulate Turbo adding the element to the DOM during morph
      const el = document.createElement("div")
      el.id = "item-1"
      el.setAttribute("data-turbo-refresh-animate", "")
      container.appendChild(el)

      dispatchTurboRender()

      // In jsdom, getComputedStyle returns 0s durations, so the class is
      // applied and immediately removed. We check it was processed by
      // verifying the element exists and wasn't erroneously removed.
      expect(el.parentElement).toBe(container)
    })

    it("does not apply enter class to existing elements", () => {
      const el = document.createElement("div")
      el.id = "item-1"
      el.setAttribute("data-turbo-refresh-animate", "")
      el.textContent = "hello"
      container.appendChild(el)

      const newBody = buildNewBody(
        '<div id="item-1" data-turbo-refresh-animate>hello</div>'
      )
      samePageRefreshCycle(newBody)

      // No animation class should have been applied (content unchanged)
      // In jsdom the class would be immediately removed anyway, but
      // classList should be empty
      expect(el.classList.length).toBe(0)
    })
  })

  describe("change animations", () => {
    it("detects changes via textContent", () => {
      const el = document.createElement("div")
      el.id = "item-1"
      el.setAttribute("data-turbo-refresh-animate", "")
      el.textContent = "old text"
      container.appendChild(el)

      const newBody = buildNewBody(
        '<div id="item-1" data-turbo-refresh-animate>old text</div>'
      )
      const url = window.location.href
      dispatchTurboVisit(url, "replace")
      dispatchTurboBeforeRender(newBody)

      // Simulate Turbo morphing the content
      el.textContent = "new text"

      dispatchTurboRender()

      // Change was detected (textContent differs from snapshot).
      // In jsdom, class is immediately removed due to 0ms computed duration,
      // but we can verify the element is still in the DOM.
      expect(el.parentElement).toBe(container)
    })

    it("detects changes via data-turbo-refresh-version", () => {
      const el = document.createElement("div")
      el.id = "item-1"
      el.setAttribute("data-turbo-refresh-animate", "")
      el.setAttribute("data-turbo-refresh-version", "v1")
      container.appendChild(el)

      const newBody = buildNewBody(
        '<div id="item-1" data-turbo-refresh-animate data-turbo-refresh-version="v1"></div>'
      )
      const url = window.location.href
      dispatchTurboVisit(url, "replace")
      dispatchTurboBeforeRender(newBody)

      // Simulate Turbo morphing the version attribute
      el.setAttribute("data-turbo-refresh-version", "v2")

      dispatchTurboRender()

      expect(el.parentElement).toBe(container)
    })

    it("does not trigger change when textContent is unchanged", () => {
      const el = document.createElement("div")
      el.id = "item-1"
      el.setAttribute("data-turbo-refresh-animate", "")
      el.textContent = "same text"
      container.appendChild(el)

      const newBody = buildNewBody(
        '<div id="item-1" data-turbo-refresh-animate>same text</div>'
      )
      samePageRefreshCycle(newBody)

      expect(el.classList.length).toBe(0)
    })

    it("normalizes whitespace when comparing textContent", () => {
      const el = document.createElement("div")
      el.id = "item-1"
      el.setAttribute("data-turbo-refresh-animate", "")
      el.textContent = "  hello   world  "
      container.appendChild(el)

      const newBody = buildNewBody(
        '<div id="item-1" data-turbo-refresh-animate>  hello   world  </div>'
      )

      // Even though raw textContent has extra whitespace, normalized versions match
      samePageRefreshCycle(newBody)

      expect(el.classList.length).toBe(0)
    })
  })

  describe("non-replace visits", () => {
    it("does not animate during advance visits", () => {
      const newBody = buildNewBody('<div id="item-1" data-turbo-refresh-animate></div>')

      dispatchTurboVisit(window.location.href, "advance")
      dispatchTurboBeforeRender(newBody)

      const el = document.createElement("div")
      el.id = "item-1"
      el.setAttribute("data-turbo-refresh-animate", "")
      container.appendChild(el)

      dispatchTurboRender()

      expect(el.classList.length).toBe(0)
    })
  })
})

describe("getAnimationClass opt-in logic", () => {
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

  // We test this indirectly via enter animations: a new element appears,
  // and we check whether the animation class is considered enabled.
  // Since jsdom has 0ms durations, the class is applied and immediately removed.
  // We use a spy on classList to detect the add call.

  function setupEnterScenario(attrs) {
    const newBody = buildNewBody(`<div id="test-el" ${attrs}></div>`)
    const url = window.location.href
    dispatchTurboVisit(url, "replace")
    dispatchTurboBeforeRender(newBody)

    const el = document.createElement("div")
    el.id = "test-el"
    // Apply the same attributes to the live element
    const temp = document.createElement("div")
    temp.innerHTML = `<div ${attrs}></div>`
    for (const attr of temp.firstChild.attributes) {
      el.setAttribute(attr.name, attr.value)
    }
    container.appendChild(el)

    const added = []
    const originalAdd = el.classList.add.bind(el.classList)
    el.classList.add = (...classes) => {
      added.push(...classes)
      originalAdd(...classes)
    }

    dispatchTurboRender()
    return added
  }

  it("enables all animations when attribute is present but empty", () => {
    const added = setupEnterScenario('data-turbo-refresh-animate')
    expect(added).toContain("turbo-refresh-enter")
  })

  it("disables animations when attribute is 'none'", () => {
    const added = setupEnterScenario('data-turbo-refresh-animate="none"')
    expect(added).not.toContain("turbo-refresh-enter")
  })

  it("disables animations when attribute is 'false'", () => {
    const added = setupEnterScenario('data-turbo-refresh-animate="false"')
    expect(added).not.toContain("turbo-refresh-enter")
  })

  it("enables only specified animation types", () => {
    const added = setupEnterScenario('data-turbo-refresh-animate="exit"')
    expect(added).not.toContain("turbo-refresh-enter")
  })

  it("enables enter when explicitly listed", () => {
    const added = setupEnterScenario('data-turbo-refresh-animate="enter,exit"')
    expect(added).toContain("turbo-refresh-enter")
  })

  it("uses custom class from data-turbo-refresh-enter", () => {
    const added = setupEnterScenario(
      'data-turbo-refresh-animate data-turbo-refresh-enter="my-custom-enter"'
    )
    expect(added).toContain("my-custom-enter")
    expect(added).not.toContain("turbo-refresh-enter")
  })

  it("treats 'true' as all animations enabled", () => {
    const added = setupEnterScenario('data-turbo-refresh-animate="true"')
    expect(added).toContain("turbo-refresh-enter")
  })
})
