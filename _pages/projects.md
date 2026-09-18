---
layout: page
title: projects
permalink: /projects/
nav: false
nav_order: 3
horizontal: false
_styles: >
  .post-header {
    border-bottom: 1px solid var(--global-divider-color);
    padding-bottom: 0.5rem;
  }
  .post-description:empty {
    display: none;
  }
---

<div class="projects">
  {% assign sorted_projects = site.projects | sort: "importance" %}

{% if page.horizontal %}

<div class="container">
<div class="row row-cols-1 row-cols-md-2">
{% for project in sorted_projects %}
{% include projects_horizontal.liquid %}
{% endfor %}
</div>
</div>
{% else %}
<div class="row row-cols-1 row-cols-md-3">
{% for project in sorted_projects %}
{% include projects.liquid %}
{% endfor %}
</div>
{% endif %}

</div>
