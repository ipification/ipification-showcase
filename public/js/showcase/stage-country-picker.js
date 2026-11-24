export function attachStageCountryPicker(select, button, menu) {
  const search = menu.querySelector(".showcase-country-search");
  const list = menu.querySelector(".showcase-country-list");
  const controller = new AbortController();
  let active = 0;
  const buttons = Array.from(select.options, (option) => {
    const item = document.createElement("li");
    item.setAttribute("role", "presentation");
    const choice = document.createElement("button");
    choice.type = "button";
    choice.tabIndex = -1;
    choice.className = "showcase-country-option";
    choice.setAttribute("role", "option");
    const flag = document.createElement("span");
    flag.className =
      option.value === "ww"
        ? "showcase-country-wonderland-flag"
        : `iti__flag iti__${option.value}`;
    flag.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.textContent = option.textContent;
    choice.append(flag, label);
    choice.addEventListener(
      "click",
      () => {
        select.value = option.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        close();
        button.focus();
      },
      { signal: controller.signal },
    );
    item.append(choice);
    list.append(item);
    return choice;
  });
  const visible = () =>
    buttons.filter((choice) => !choice.parentElement.hidden);
  function highlight() {
    const choices = visible();
    active = Math.max(0, Math.min(active, choices.length - 1));
    buttons.forEach((choice) =>
      choice.setAttribute("aria-selected", String(choice === choices[active])),
    );
    return choices[active];
  }
  function close() {
    menu.hidden = true;
    button.setAttribute("aria-expanded", "false");
  }
  button.addEventListener(
    "click",
    () => {
      if (!menu.hidden) return close();
      search.value = "";
      buttons.forEach((choice) => {
        choice.parentElement.hidden = false;
      });
      active = Math.max(0, select.selectedIndex);
      menu.hidden = false;
      highlight()?.scrollIntoView({ block: "nearest" });
      button.setAttribute("aria-expanded", "true");
      search.focus();
    },
    { signal: controller.signal },
  );
  search.addEventListener(
    "input",
    () => {
      const value = search.value.trim().toLocaleLowerCase();
      buttons.forEach((choice) => {
        choice.parentElement.hidden = !choice.textContent
          .toLocaleLowerCase()
          .includes(value);
      });
      active = 0;
      highlight();
    },
    { signal: controller.signal },
  );
  menu.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        button.focus();
      } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        active += event.key === "ArrowDown" ? 1 : -1;
        highlight()?.scrollIntoView({ block: "nearest" });
      } else if (event.key === "Enter" && event.target === search) {
        event.preventDefault();
        highlight()?.click();
      }
    },
    { signal: controller.signal },
  );
  menu.addEventListener(
    "focusout",
    (event) => {
      if (!menu.contains(event.relatedTarget) && event.relatedTarget !== button)
        close();
    },
    { signal: controller.signal },
  );
  document.addEventListener(
    "pointerdown",
    (event) => {
      if (
        !menu.hidden &&
        !menu.contains(event.target) &&
        !button.contains(event.target)
      )
        close();
    },
    { signal: controller.signal },
  );
  return { destroy: () => controller.abort() };
}
