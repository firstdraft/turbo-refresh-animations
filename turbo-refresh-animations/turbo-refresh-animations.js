// ========== TURBO REFRESH ANIMATIONS ==========
// Animates elements during Turbo morphs using MutationObserver + Turbo events

let hasRenderedCurrentPage = true
let lastRenderedUrl = window.location.href
let observer = null
let createdIds = new Set()
let updatedIds = new Set()
let protectedUpdates = new Map()

// ========== FORM PROTECTION ==========
// Protect elements with data-turbo-stream-refresh-permanent during stream-delivered
// refreshes (broadcasts). During navigation, protect elements with non-blank inputs.

let inStreamRefresh = false
let submittingPermanentId = null

document.addEventListener("turbo:before-stream-render", (event) => {
  if (event.target.getAttribute("action") === "refresh") {
    inStreamRefresh = true
  }
})

document.addEventListener("turbo:submit-start", (event) => {
  const wrapper = event.target.closest("[data-turbo-stream-refresh-permanent]")
  submittingPermanentId = wrapper?.id || null
})

document.addEventListener("turbo:visit", (event) => {
  if (event.detail.url !== lastRenderedUrl) {
    hasRenderedCurrentPage = false
  }
})

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

// Handle morphing: protect permanent elements, animate deletes
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
        applyAnimation(currentEl, "turbo-refresh-change")
        protectedUpdates.delete(currentEl.id)
      }
      return
    }
  }

  // Handle DELETES (newElement undefined)
  if (!currentEl.id || !currentEl.hasAttribute("data-turbo-refresh-animate")) return

  if (newEl === undefined) {
    event.preventDefault()
    currentEl.classList.add("turbo-refresh-exit")
    currentEl.addEventListener("animationend", () => {
      currentEl.remove()
    }, { once: true })
  }
})

// Before render: detect deletions and animate BEFORE morph
document.addEventListener("turbo:before-render", async (event) => {
  if (!event.detail.newBody) return

  createdIds = new Set()
  updatedIds = new Set()
  protectedUpdates = new Map()

  if (!hasRenderedCurrentPage) {
    return
  }

  const existingIds = new Set()
  document.querySelectorAll("[id]").forEach(el => existingIds.add(el.id))

  // Detect elements that will be deleted
  const newBodyIds = new Set()
  event.detail.newBody.querySelectorAll("[id]").forEach(el => newBodyIds.add(el.id))

  const deletions = []
  document.querySelectorAll("[data-turbo-refresh-animate][id]").forEach(el => {
    if (!newBodyIds.has(el.id)) {
      deletions.push(el)
    }
  })

  // If there are deletions, animate them BEFORE the morph
  if (deletions.length > 0) {
    event.preventDefault()

    const animationPromises = deletions.map(el => {
      return new Promise(resolve => {
        el.classList.add("turbo-refresh-exit")
        el.addEventListener("animationend", () => {
          el.remove()
          resolve()
        }, { once: true })
      })
    })

    await Promise.all(animationPromises)

    // Now manually trigger the render
    event.detail.resume()
  }

  // Detect updates to protected elements (they won't morph, so MutationObserver won't see them)
  // Use data-turbo-refresh-version for comparison if present
  if (inStreamRefresh) {
    document.querySelectorAll("[data-turbo-stream-refresh-permanent][data-turbo-refresh-version][id]").forEach(el => {
      const newEl = event.detail.newBody.querySelector(`#${CSS.escape(el.id)}`)
      if (newEl) {
        const oldVersion = el.dataset.turboRefreshVersion
        const newVersion = newEl.dataset.turboRefreshVersion
        if (oldVersion !== newVersion) {
          protectedUpdates.set(el.id, true)
        }
      }
    })
  }

  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
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

      if (mutation.type === "attributes") {
        if (mutation.attributeName === "class") continue
        const id = findClosestAnimatable(mutation.target)
        if (id && existingIds.has(id) && !createdIds.has(id)) {
          updatedIds.add(id)
        }
      }

      if (mutation.type === "characterData") {
        const id = findClosestAnimatable(mutation.target)
        if (id && existingIds.has(id) && !createdIds.has(id)) {
          updatedIds.add(id)
        }
      }

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

document.addEventListener("turbo:render", () => {
  if (observer) {
    observer.disconnect()
    observer = null
  }

  hasRenderedCurrentPage = true
  lastRenderedUrl = window.location.href
  inStreamRefresh = false
  submittingPermanentId = null

  createdIds.forEach(id => {
    const el = document.getElementById(id)
    if (el) {
      applyAnimation(el, "turbo-refresh-enter")
    }
  })

  updatedIds.forEach(id => {
    const el = document.getElementById(id)
    if (el) {
      applyAnimation(el, "turbo-refresh-change")
    }
  })

  createdIds = new Set()
  updatedIds = new Set()
  protectedUpdates = new Map()
})
