export function initPaneDivider() {
  const divider = document.getElementById("pane-divider");
  const leftPane = document.getElementById("left-pane");
  const mainEl = document.querySelector("main");

  const minPaneWidth = 250;

  // Track position as a ratio (0–1) of available space so it
  // stays proportional when the window is resized.
  let splitRatio = 6 / 11;

  function applyRatio() {
    const availableWidth = mainEl.offsetWidth - divider.offsetWidth;
    const leftWidth = Math.round(availableWidth * splitRatio);
    const clampedWidth = Math.max(minPaneWidth, Math.min(availableWidth - minPaneWidth, leftWidth));
    leftPane.style.width = clampedWidth + "px";
  }

  applyRatio();

  let isDragging = false;

  divider.addEventListener("mousedown", (event) => {
    event.preventDefault();
    isDragging = true;
    divider.classList.add("active");
    document.body.style.userSelect = "none";
    document.body.style.webkitUserSelect = "none";
  });

  document.addEventListener("mousemove", (event) => {
    if (!isDragging) {
      return;
    }

    const rect = mainEl.getBoundingClientRect();
    const availableWidth = rect.width - divider.offsetWidth;
    const maxLeft = availableWidth - minPaneWidth;
    const minLeft = minPaneWidth;

    let newLeftWidth = event.clientX - rect.left;
    newLeftWidth = Math.max(minLeft, Math.min(maxLeft, newLeftWidth));

    splitRatio = newLeftWidth / availableWidth;
    leftPane.style.width = newLeftWidth + "px";
  });

  document.addEventListener("mouseup", () => {
    if (!isDragging) {
      return;
    }

    isDragging = false;
    divider.classList.remove("active");
    document.body.style.userSelect = "";
    document.body.style.webkitUserSelect = "";
  });

  window.addEventListener("resize", applyRatio);
}
