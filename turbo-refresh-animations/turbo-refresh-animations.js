// ========== TURBO REFRESH ANIMATIONS ==========
// Animates elements during Turbo page refresh morphs using Turbo events + before/after signatures

let lastRenderedUrl = window.location.href
let pendingVisitUrl = null
let pendingVisitAction = null
let shouldAnimateAfterRender = false
let protectedUpdates = new Set()
let signaturesBefore = new Map()
const animationClassCleanupTimers = new WeakMap()

// ========== FORM PROTECTION ==========
// Protect elements with data-turbo-stream-refresh-permanent during same-page refresh
// morphs ("page refreshes"). Allow the initiating element
// (form submit / link click inside it) to morph so user-intended updates apply.

let submittingPermanentId = null
let pendingVisitingPermanentId = null
let pendingVisitingPermanentAtMs = 0
let visitingPermanentId = null

document.addEventListener("turbo:submit-start", (event) => {
  const wrapper = event.target.closest("[data-turbo-stream-refresh-permanent]")
  submittingPermanentId = wrapper?.id || null
})

document.addEventListener("turbo:submit-end", (event) => {
  const contentType = event.detail?.fetchResponse?.contentType || ""
  if (contentType.startsWith("text/vnd.turbo-stream.html")) {
    submittingPermanentId = null
  }
})

document.addEventListener("turbo:click", (event) => {
  const wrapper = event.target.closest("[data-turbo-stream-refresh-permanent][id]")
  pendingVisitingPermanentId = wrapper?.id || null
  pendingVisitingPermanentAtMs = Date.now()
})

document.addEventListener("turbo:visit", (event) => {
  pendingVisitUrl = event.detail.url
  pendingVisitAction = event.detail.action

  const ageMs = Date.now() - pendingVisitingPermanentAtMs
  visitingPermanentId = ageMs >= 0 && ageMs < 2000 ? pendingVisitingPermanentId : null
  pendingVisitingPermanentId = null
  pendingVisitingPermanentAtMs = 0
})

document.addEventListener("turbo:before-cache", () => {
  document.querySelectorAll("[data-turbo-refresh-animate]").forEach(el => {
    const timers = animationClassCleanupTimers.get(el)
    if (timers) {
      for (const timer of timers.values()) {
        window.clearTimeout(timer)
      }
      timers.clear()
    }

    const animationClasses = new Set([
      "turbo-refresh-enter",
      "turbo-refresh-change",
      "turbo-refresh-exit",
      el.getAttribute("data-turbo-refresh-enter"),
      el.getAttribute("data-turbo-refresh-change"),
      el.getAttribute("data-turbo-refresh-exit")
    ])

    for (const className of animationClasses) {
      if (className) el.classList.remove(className)
    }
  })
})

function getAnimationClass(el, animType, defaultClass) {
  // Check if animation type is enabled via data-turbo-refresh-animate value
  // Empty value or no value = all enabled; comma-separated list = only those types
  const animateValue = el.getAttribute("data-turbo-refresh-animate")
  if (animateValue !== null && animateValue !== "") {
    const enabledTypes = animateValue.split(",").map(s => s.trim().toLowerCase())
    if (!enabledTypes.includes(animType)) return null
  }

  // Check for custom class via data-turbo-refresh-{type}="my-class"
  const customClass = el.getAttribute(`data-turbo-refresh-${animType}`)
  return customClass || defaultClass
}

function applyAnimation(el, defaultClass) {
  // Extract animation type from class name (e.g., "turbo-refresh-enter" -> "enter")
  const animType = defaultClass.replace("turbo-refresh-", "")
  const animClass = getAnimationClass(el, animType, defaultClass)
  if (!animClass) return

  if (el.classList.contains(animClass)) {
    el.classList.remove(animClass)
    // Force a reflow so the same animation class can retrigger.
    void el.offsetWidth
  }

  el.classList.add(animClass)

  let timers = animationClassCleanupTimers.get(el)
  if (!timers) {
    timers = new Map()
    animationClassCleanupTimers.set(el, timers)
  }

  const existingTimer = timers.get(animClass)
  if (existingTimer) window.clearTimeout(existingTimer)

  const waitMs = maxWaitMsForAnimationOrTransition(el)
  if (waitMs === 0) {
    el.classList.remove(animClass)
    timers.delete(animClass)
    return
  }

  const timer = window.setTimeout(() => {
    el.classList.remove(animClass)
    const currentTimers = animationClassCleanupTimers.get(el)
    currentTimers?.delete(animClass)
  }, waitMs)
  timers.set(animClass, timer)
}

function normalizedTextContent(el) {
  return (el.textContent || "").replace(/\s+/g, " ").trim()
}

function meaningfulUpdateSignature(el) {
  const version = el.getAttribute("data-turbo-refresh-version")
  if (version !== null) return `v:${version}`
  return `t:${normalizedTextContent(el)}`
}

function pathnameForUrl(url) {
  try {
    return new URL(url, document.baseURI).pathname
  } catch {
    return null
  }
}

function isPageRefreshVisit() {
  if (pendingVisitAction !== "replace") return false
  if (!pendingVisitUrl) return false

  const pendingPathname = pathnameForUrl(pendingVisitUrl)
  const lastRenderedPathname = pathnameForUrl(lastRenderedUrl)
  if (!pendingPathname || !lastRenderedPathname) return false

  return pendingPathname === lastRenderedPathname
}

function parseCssTimeMs(value) {
  const trimmed = value.trim()
  if (trimmed === "") return 0
  if (trimmed.endsWith("ms")) return Number.parseFloat(trimmed)
  if (trimmed.endsWith("s")) return Number.parseFloat(trimmed) * 1000
  const fallback = Number.parseFloat(trimmed)
  return Number.isFinite(fallback) ? fallback * 1000 : 0
}

function parseCssTimeListMs(value) {
  return value
    .split(",")
    .map(part => parseCssTimeMs(part))
    .filter(Number.isFinite)
}

function parseCssNumberList(value) {
  return value
    .split(",")
    .map(part => {
      const trimmed = part.trim()
      if (trimmed === "infinite") return 1
      const num = Number.parseFloat(trimmed)
      return Number.isFinite(num) ? num : 1
    })
}

function maxTimingMs(durationsMs, delaysMs, iterations) {
  const count = Math.max(durationsMs.length, delaysMs.length, iterations.length)
  if (count === 0) return 0

  let maxMs = 0
  for (let i = 0; i < count; i++) {
    const duration = durationsMs[i % durationsMs.length] || 0
    const delay = delaysMs[i % delaysMs.length] || 0
    const iteration = iterations[i % iterations.length] || 1
    maxMs = Math.max(maxMs, delay + duration * iteration)
  }

  return maxMs
}

function expectedAnimationEndCount(el) {
  const style = window.getComputedStyle(el)
  if (!style.animationName || style.animationName === "none") return 0

  const names = style.animationName.split(",").map(name => name.trim())
  const durationsMs = parseCssTimeListMs(style.animationDuration)
  const iterations = parseCssNumberList(style.animationIterationCount)

  let count = 0
  for (let i = 0; i < names.length; i++) {
    const name = names[i]
    if (!name || name === "none") continue
    const duration = durationsMs[i % durationsMs.length] || 0
    const iteration = iterations[i % iterations.length] || 1
    if (duration > 0 && iteration > 0) count += 1
  }

  return count
}

function maxWaitMsForAnimationOrTransition(el) {
  const style = window.getComputedStyle(el)
  let maxMs = 0

  if (style.animationName && style.animationName !== "none") {
    maxMs = Math.max(
      maxMs,
      maxTimingMs(
        parseCssTimeListMs(style.animationDuration),
        parseCssTimeListMs(style.animationDelay),
        parseCssNumberList(style.animationIterationCount)
      )
    )
  }

  if (style.transitionProperty && style.transitionProperty !== "none") {
    maxMs = Math.max(
      maxMs,
      maxTimingMs(
        parseCssTimeListMs(style.transitionDuration),
        parseCssTimeListMs(style.transitionDelay),
        [1]
      )
    )
  }

  return maxMs > 0 ? maxMs + 50 : 0
}

function animateAndRemove(el, animClass) {
  return new Promise(resolve => {
    let finished = false
    let timer = null
    let endedCount = 0
    let expectedEnds = 0

    const finish = () => {
      if (finished) return
      finished = true

      if (timer) clearTimeout(timer)
      el.removeEventListener("animationend", onEnd)
      el.removeEventListener("animationcancel", onCancel)
      el.removeEventListener("transitioncancel", onCancel)

      el.remove()
      resolve()
    }

    const onEnd = (event) => {
      if (event.target !== el) return
      endedCount += 1
      if (expectedEnds > 0 && endedCount >= expectedEnds) {
        finish()
      }
    }

    const onCancel = (event) => {
      if (event.target !== el) return
      finish()
    }

    el.addEventListener("animationend", onEnd)
    el.addEventListener("animationcancel", onCancel)
    el.addEventListener("transitioncancel", onCancel)

    el.classList.add(animClass)

    expectedEnds = expectedAnimationEndCount(el)
    const waitMs = maxWaitMsForAnimationOrTransition(el)

    if (expectedEnds === 0 && waitMs === 0) {
      finish()
      return
    }

    timer = setTimeout(finish, waitMs > 0 ? waitMs : 2000)
  })
}

// Handle morphing: protect permanent elements, animate deletes
document.addEventListener("turbo:before-morph-element", (event) => {
  const currentEl = event.target
  const newEl = event.detail.newElement

  // Protect permanent elements:
  // - During same-page refresh morphs (preserve user state like open forms)
  // - EXCEPT the element initiating the refresh (form submit or link click within it)
  if (currentEl.hasAttribute("data-turbo-stream-refresh-permanent")) {
    const isSubmitting = currentEl.id === submittingPermanentId
    const isVisiting = currentEl.id === visitingPermanentId
    const isInitiator = isSubmitting || isVisiting
    const shouldProtect = !isInitiator && shouldAnimateAfterRender

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
    const exitClass = getAnimationClass(currentEl, "exit", "turbo-refresh-exit")
    if (!exitClass) return // Let Idiomorph remove it normally

    event.preventDefault()
    animateAndRemove(currentEl, exitClass)
  }
})

// Before render: detect deletions and animate BEFORE morph
document.addEventListener("turbo:before-render", async (event) => {
  if (!event.detail.newBody) return

  protectedUpdates = new Set()
  signaturesBefore = new Map()

  shouldAnimateAfterRender = isPageRefreshVisit()
  if (!shouldAnimateAfterRender) {
    return
  }

  document.querySelectorAll("[data-turbo-refresh-animate][id]").forEach(el => {
    signaturesBefore.set(el.id, meaningfulUpdateSignature(el))
  })

  let shouldResume = false

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
    // Filter to only elements that want exit animation and get their classes
    const candidateDeletions = deletions
      .map(el => ({ el, exitClass: getAnimationClass(el, "exit", "turbo-refresh-exit") }))
      .filter(({ exitClass }) => exitClass)

    if (candidateDeletions.length > 0) {
      event.preventDefault()
      shouldResume = true

      const candidateSet = new Set(candidateDeletions.map(({ el }) => el))
      const topLevelDeletions = candidateDeletions.filter(({ el }) => {
        let parent = el.parentElement
        while (parent) {
          if (candidateSet.has(parent)) return false
          parent = parent.parentElement
        }
        return true
      })

      await Promise.all(topLevelDeletions.map(({ el, exitClass }) => animateAndRemove(el, exitClass)))
    }
  }

  // Detect updates to protected elements (they won't morph, so post-render signatures won't change)
  // Only use data-turbo-refresh-version for this to avoid false positives from view-state differences.
  document.querySelectorAll("[data-turbo-stream-refresh-permanent][data-turbo-refresh-animate][data-turbo-refresh-version][id]").forEach(el => {
    const newEl = event.detail.newBody.querySelector(`#${CSS.escape(el.id)}`)
    if (newEl) {
      const oldVersion = el.getAttribute("data-turbo-refresh-version")
      const newVersion = newEl.getAttribute("data-turbo-refresh-version")
      if (newVersion === null) return
      if (oldVersion !== newVersion) {
        protectedUpdates.add(el.id)
      }
    }
  })

  if (shouldResume) {
    event.detail.resume()
  }
})

document.addEventListener("turbo:render", () => {
  lastRenderedUrl = window.location.href
  submittingPermanentId = null
  visitingPermanentId = null

  if (shouldAnimateAfterRender) {
    document.querySelectorAll("[data-turbo-refresh-animate][id]").forEach(el => {
      const beforeSignature = signaturesBefore.get(el.id)
      if (beforeSignature === undefined) {
        applyAnimation(el, "turbo-refresh-enter")
        return
      }

      const afterSignature = meaningfulUpdateSignature(el)
      if (beforeSignature !== afterSignature) {
        applyAnimation(el, "turbo-refresh-change")
      }
    })
  }

  shouldAnimateAfterRender = false
  protectedUpdates = new Set()
  signaturesBefore = new Map()
})
