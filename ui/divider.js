export function initPaneDivider() {
  const divider = document.getElementById("pane-divider");
  const leftPane = document.getElementById("left-pane");
  const mainEl = document.querySelector("main");

  const totalWidth = mainEl.offsetWidth;
  const dividerWidth = divider.offsetWidth;
  const leftWidth = Math.round((totalWidth - dividerWidth) * (6 / 11));
  leftPane.style.width = leftWidth + "px";

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
    const dividerWidth = divider.offsetWidth;
    const minPaneWidth = 250;
    const maxLeft = rect.width - dividerWidth - minPaneWidth;
    const minLeft = minPaneWidth;

    let newLeftWidth = event.clientX - rect.left;
    newLeftWidth = Math.max(minLeft, Math.min(maxLeft, newLeftWidth));

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
}
