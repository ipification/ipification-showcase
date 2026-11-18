const copy = document.querySelector("#copy-json");
copy?.addEventListener("click", async () => {
  const status = document.querySelector("#copy-status");
  try {
    await navigator.clipboard.writeText(
      document.querySelector(".legacy-result-json").textContent,
    );
    status.textContent = "JSON copied";
  } catch {
    status.textContent = "Unable to copy JSON. Please copy it manually.";
  }
});
