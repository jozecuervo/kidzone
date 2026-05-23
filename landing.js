const projectGrid = document.querySelector("[data-project-grid]");
const projectCount = document.querySelector("[data-project-count]");

function projectTag(label) {
  const tag = document.createElement("span");

  tag.className = "project-tag";
  tag.textContent = label;

  return tag;
}

function projectBadge(label) {
  const badge = document.createElement("span");

  badge.className = "project-safety-badge";
  badge.textContent = label;

  return badge;
}

function projectSafetyBadges(project) {
  const badges = [];

  if (project.ageRange) {
    badges.push(`Ages ${project.ageRange}`);
  }

  if (project.interaction?.includes("camera")) {
    badges.push("Camera: adult help");
  } else if (project.runtime?.networkAccess === "declared-external-dependency") {
    badges.push("External dependency");
  } else if (project.runtime?.networkAccess === "none") {
    badges.push("No network");
  }

  if (project.runtime?.storesData === false) {
    badges.push("No saved data");
  }

  return badges;
}

function projectCard(project) {
  const card = document.createElement("article");
  const link = document.createElement("a");
  const top = document.createElement("div");
  const meta = document.createElement("div");
  const tags = document.createElement("div");
  const safety = document.createElement("div");
  const date = document.createElement("time");
  const title = document.createElement("h3");
  const description = document.createElement("p");
  const cta = document.createElement("span");

  card.className = "project-card";
  top.className = "project-card-top";
  meta.className = "project-meta";
  tags.className = "project-tags";
  safety.className = "project-safety";
  cta.className = "project-cta";

  link.href = project.href;
  title.textContent = project.title;
  description.textContent = project.description ?? project.summary;
  cta.textContent = project.cta ?? "Open project";

  if (project.date) {
    date.dateTime = project.date;
    date.textContent = formatProjectDate(project.date);
    date.title = project.dateSource ?? "";
  }

  for (const tag of project.tags ?? []) {
    tags.append(projectTag(tag));
  }

  for (const badge of projectSafetyBadges(project)) {
    safety.append(projectBadge(badge));
  }

  meta.append(tags);

  if (project.date) {
    meta.append(date);
  }

  top.append(meta, title, description, safety);
  link.append(top, cta);
  card.append(link);

  return card;
}

function formatProjectDate(value) {
  const date = new Date(`${value}T12:00:00`);

  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(date);
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
