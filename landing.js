const projectGrid = document.querySelector("[data-project-grid]");
const projectCount = document.querySelector("[data-project-count]");

function projectTag(label) {
  const tag = document.createElement("span");

  tag.className = "project-tag";
  tag.textContent = label;

  return tag;
}

function projectCard(project) {
  const card = document.createElement("article");
  const link = document.createElement("a");
  const top = document.createElement("div");
  const tags = document.createElement("div");
  const title = document.createElement("h3");
  const summary = document.createElement("p");
  const cta = document.createElement("span");

  card.className = "project-card";
  top.className = "project-card-top";
  tags.className = "project-tags";
  cta.className = "project-cta";

  link.href = project.href;
  title.textContent = project.title;
  summary.textContent = project.summary;
  cta.textContent = project.cta ?? "Open project";

  for (const tag of project.tags ?? []) {
    tags.append(projectTag(tag));
  }

  top.append(tags, title, summary);
  link.append(top, cta);
  card.append(link);

  return card;
}

function showEmpty(message) {
  const empty = document.createElement("p");

  empty.className = "project-empty";
  empty.textContent = message;
  projectGrid.replaceChildren(empty);
}

async function loadProjects() {
  try {
    const response = await fetch("./projects/index.json", {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`Project index returned ${response.status}.`);
    }

    const { projects } = await response.json();

    if (!projects?.length) {
      projectCount.textContent = "No projects yet";
      showEmpty("Run the new-project script and add the first tiny idea.");
      return;
    }

    const cards = projects.map(projectCard);

    projectCount.textContent =
      projects.length === 1 ? "1 project ready" : `${projects.length} projects ready`;
    projectGrid.replaceChildren(...cards);
  } catch (error) {
    console.error(error);
    projectCount.textContent = "Index needs refresh";
    showEmpty("Run the local server and refresh the project index script.");
  }
}

loadProjects();
