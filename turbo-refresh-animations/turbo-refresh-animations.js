/**
 * Turbo Refresh Animations
 *
 * CSS class-based animations for Turbo page refresh morphs.
 * Animates elements on create, update, and delete.
 * Protects forms from being cleared during broadcast refreshes.
 *
 * Required data attributes:
 *   data-turbo-refresh-animate           - Opt-in element for animations
 *
 * Optional data attributes:
 *   data-turbo-stream-refresh-permanent  - Protect element during broadcast morphs
 *   data-turbo-refresh-version="value"   - Version for change detection (e.g., cache_key_with_version)
 *
 * Default animation classes (override in CSS):
 *   .turbo-refresh-enter  - Applied to new elements
 *   .turbo-refresh-update - Applied to modified elements
 *   .turbo-refresh-exit   - Applied to removed elements
 */

// ========== STATE ==========

let hasRenderedCurrentPage = true
let lastRenderedUrl = window.location.href
let observer = null
let createdIds = new Set()
let updatedIds = new Set()
let protectedUpdates = new Map()
let inStreamRefresh = false
let submittingPermanentId = null

// ========== STREAM REFRESH DETECTION ==========
// Detect when a morph is triggered by a broadcast (Turbo Stream) vs navigation

document.addEventListener("turbo:before-stream-render", (event) => {
  if (event.target.getAttribute("action") === "refresh") {
    inStreamRefresh = true
  }
})

// ========== FORM SUBMISSION TRACKING ==========
// Track which permanent element is being submitted so it can be morphed

document.addEventListener("turbo:submit-start", (event) => {
  const wrapper = event.target.closest("[data-turbo-stream-refresh-permanent]")
  submittingPermanentId = wrapper?.id || null
})

// ========== PAGE NAVIGATION ==========
// Track page changes to avoid animating existing elements on initial load

document.addEventListener("turbo:visit", (event) => {
  if (event.detail.url !== lastRenderedUrl) {
    hasRenderedCurrentPage = false
  }
})

// ========== HELPER FUNCTIONS ==========

function applyAnimation(el, animClass) {
  el.classList.add(animClass)
  el.addEventListener("animationend", () => el.classList.remove(animClass), { once: true })
}

function findClosestAnimatable(node) {
  if (node.nodeType !== 1) node = node.parentElement
  while (node) {
    if (node.id && node.hasAttribute("data-turbo-refresh-animate")) return node.id
    node = node.parentElement
  }
  return null
}

function hasNonBlankInputs(el) {
  const inputs = el.querySelectorAll("input, textarea, select")
  for (const input of inputs) {
    if (input.type === "hidden" || input.type === "submit") continue
    if (input.type === "checkbox" || input.type === "radio") {
      if (input.checked !== input.defaultChecked) return true
    } else if (input.value && input.value.trim() !== "") {
      return true
    }
  }
  return false
}

// ========== MORPH HANDLING ==========
// Protect permanent elements and animate deletions

document.addEventListener("turbo:before-morph-element", (event) => {
  const currentEl = event.target
  const newEl = event.detail.newElement

  // Protect permanent elements:
  // - Always during stream refresh (broadcast)
  // - During navigation if element contains non-blank inputs (preserve user's work)
  // - EXCEPT the form being submitted (it should always clear/refresh)
  if (currentEl.hasAttribute("data-turbo-stream-refresh-permanent")) {
    const isSubmitting = currentEl.id === submittingPermanentId
    const shouldProtect = !isSubmitting && (inStreamRefresh || hasNonBlankInputs(currentEl))

    if (shouldProtect) {
      event.preventDefault()

      // Apply update animation if content changed (detected in turbo:before-render)
      if (protectedUpdates.has(currentEl.id)) {
        applyAnimation(currentEl, "turbo-refresh-update")
        protectedUpdates.delete(currentEl.id)
      }
      return
    }
  }

  // Handle DELETES (newElement undefined means Idiomorph is removing this element)
  if (!currentEl.id || !currentEl.hasAttribute("data-turbo-refresh-animate")) return

  if (newEl === undefined) {
    event.preventDefault()
    currentEl.classList.add("turbo-refresh-exit")
    currentEl.addEventListener("animationend", () => {
      currentEl.remove()
    }, { once: true })
  }
})

// ========== CREATE & UPDATE DETECTION ==========
// Use MutationObserver to detect what Idiomorph actually changes

document.addEventListener("turbo:before-render", (event) => {
  if (!event.detail.newBody) return

  createdIds = new Set()
  updatedIds = new Set()
  protectedUpdates = new Map()

  // Skip animation detection on initial page navigation
  if (!hasRenderedCurrentPage) return

  const existingIds = new Set()
  document.querySelectorAll("[id]").forEach(el => existingIds.add(el.id))

  // Detect updates to protected elements (they won't morph, so MutationObserver won't see them)
  // Use data-turbo-refresh-version for comparison if present
  if (inStreamRefresh) {
    document.querySelectorAll("[data-turbo-stream-refresh-permanent][data-turbo-refresh-version][id]").forEach(el => {
      const newEl = event.detail.newBody.querySelector(`#${CSS.escape(el.id)}`)
      if (newEl) {
        const oldVersion = el.dataset.turboRefreshVersion
        const newVersion = newEl.dataset.turboRefreshVersion
        if (newVersion && oldVersion !== newVersion) {
          protectedUpdates.set(el.id, true)
        }
      }
    })
  }

  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      // Detect CREATES (new elements added)
      for (const node of mutation.addedNodes) {
        if (node.nodeType === 1) {
          if (node.id && node.hasAttribute("data-turbo-refresh-animate") && !existingIds.has(node.id)) {
            createdIds.add(node.id)
          }
          node.querySelectorAll?.("[id][data-turbo-refresh-animate]").forEach(child => {
            if (!existingIds.has(child.id)) {
              createdIds.add(child.id)
            }
          })
        }
      }

      // Detect UPDATES (attribute changes)
      if (mutation.type === "attributes") {
        if (mutation.attributeName === "class") continue
        const id = findClosestAnimatable(mutation.target)
        if (id && existingIds.has(id) && !createdIds.has(id)) {
          updatedIds.add(id)
        }
      }

      // Detect UPDATES (text content changes)
      if (mutation.type === "characterData") {
        const id = findClosestAnimatable(mutation.target)
        if (id && existingIds.has(id) && !createdIds.has(id)) {
          updatedIds.add(id)
        }
      }

      // Detect UPDATES (child element changes)
      if (mutation.type === "childList" && mutation.target.id && mutation.target.hasAttribute("data-turbo-refresh-animate")) {
        if (existingIds.has(mutation.target.id) && !createdIds.has(mutation.target.id)) {
          updatedIds.add(mutation.target.id)
        }
      }
    }
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeOldValue: true,
    characterData: true,
    characterDataOldValue: true
  })
})

// ========== APPLY ANIMATIONS AFTER RENDER ==========

document.addEventListener("turbo:render", () => {
  if (observer) {
    observer.disconnect()
    observer = null
  }

  hasRenderedCurrentPage = true
  lastRenderedUrl = window.location.href
  inStreamRefresh = false
  submittingPermanentId = null

  // Apply CREATE animations
  createdIds.forEach(id => {
    const el = document.getElementById(id)
    if (el) {
      applyAnimation(el, "turbo-refresh-enter")
    }
  })

  // Apply UPDATE animations
  updatedIds.forEach(id => {
    const el = document.getElementById(id)
    if (el) {
      applyAnimation(el, "turbo-refresh-update")
    }
  })

  createdIds = new Set()
  updatedIds = new Set()
  protectedUpdates = new Map()
})
