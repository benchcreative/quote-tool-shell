// Quote Tool Core Engine

const state = {
  currentStep: 0,
  answers: {}
};

async function loadConfig(configPath) {
  try {
    const response = await fetch(configPath);
    const config = await response.json();
    return config;
  } catch (error) {
    console.error("Error loading config:", error);
  }
}

function renderSingleSelect(step) {
  const optionsHtml = step.options.map(option => {
    return `
      <button class="qt-option" data-value="${option.value}">
        ${option.label}
      </button>
    `;
  }).join("");

  return `
    <div class="qt-shell">
      <p class="qt-kicker">Step 1 of 1</p>
      <h1 class="qt-title">${step.title}</h1>
      <p class="qt-subtitle">${step.subtitle}</p>
      <div class="qt-options">
        ${optionsHtml}
      </div>
      <div class="qt-selected" id="qt-selected-value"></div>
    </div>
  `;
}

function attachSingleSelectEvents(step) {
  const buttons = document.querySelectorAll(".qt-option");
  const selectedValue = document.getElementById("qt-selected-value");

  buttons.forEach(button => {
    button.addEventListener("click", () => {
      const value = button.dataset.value;

      state.answers[step.id] = value;

      buttons.forEach(btn => btn.classList.remove("is-selected"));
      button.classList.add("is-selected");

      selectedValue.textContent = `Selected: ${value}`;
      console.log("Answers:", state.answers);
    });
  });
}

function renderStep(step) {
  switch (step.type) {
    case "single-select":
      return renderSingleSelect(step);
    default:
      return `<p>Unsupported step type: ${step.type}</p>`;
  }
}

async function initQuoteTool() {
  const app = document.getElementById("quote-tool");

  try {
    const config = await loadConfig("configs/removals.json");

    if (!config) {
      throw new Error("Config not found");
    }

    const step = config.steps[state.currentStep];

    if (app) {
      app.innerHTML = renderStep(step);
      attachSingleSelectEvents(step);
    }
  } catch (error) {
    console.error(error);

    if (app) {
      app.innerHTML = `
        <h2>Error</h2>
        <p>Could not load config file.</p>
      `;
    }
  }
}

document.addEventListener("DOMContentLoaded", initQuoteTool);
