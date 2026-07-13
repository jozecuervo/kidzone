const projectGrid = document.querySelector("[data-project-grid]");
const projectCount = document.querySelector("[data-project-count]");
const featuredGrid = document.querySelector("[data-featured-grid]");

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
  const interactions = new Set(project.interaction ?? []);

  if (project.ageRange) {
    badges.push(`Ages ${project.ageRange}`);
  }

  if (interactions.has("touch")) {
    badges.push("Touch friendly");
  } else if (interactions.has("keyboard")) {
    badges.push("Keyboard needed");
  } else if (interactions.has("pointer")) {
    badges.push("Pointer friendly");
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

function featuredProjectCard(project) {
  const card = document.createElement("article");
  const previewLink = document.createElement("a");
  const preview = document.createElement("img");
  const body = document.createElement("div");
  const number = document.createElement("span");
  const title = document.createElement("h3");
  const description = document.createElement("p");
  const highlights = document.createElement("ul");
  const cta = document.createElement("a");

  card.className = "featured-card";
  previewLink.className = "featured-preview";
  body.className = "featured-body";
  number.className = "featured-number";
  highlights.className = "featured-highlights";
  cta.className = "featured-cta";

  previewLink.href = project.href;
  preview.src = project.portfolio.preview;
  preview.alt = `Preview of ${project.title}`;
  preview.loading = "lazy";
  preview.width = 960;
  preview.height = 600;
  number.textContent = String(project.featuredIndex + 1).padStart(2, "0");
  title.textContent = project.title;
  description.textContent = project.summary;
  cta.href = project.href;
  cta.textContent = `${project.cta} →`;

  for (const highlight of project.portfolio.technicalHighlights) {
    const item = document.createElement("li");
    item.textContent = highlight;
    highlights.append(item);
  }

  previewLink.append(preview);
  body.append(number, title, description, highlights, cta);
  card.append(previewLink, body);

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
    const featuredCards = projects
      .filter((project) => project.portfolio?.featured)
      .map((project, featuredIndex) =>
        featuredProjectCard({ ...project, featuredIndex })
      );

    projectCount.textContent =
      projects.length === 1 ? "1 project ready" : `${projects.length} projects ready`;
    projectGrid.replaceChildren(...cards);
    featuredGrid.replaceChildren(...featuredCards);
  } catch (error) {
    console.error(error);
    projectCount.textContent = "Index needs refresh";
    showEmpty("Run the local server and refresh the project index script.");
  }
}

loadProjects();
