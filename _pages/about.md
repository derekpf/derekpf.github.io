---
layout: about
title: about
permalink: /
subtitle: Carnegie Mellon University • M.S. Mechanical Engineering

profile:
  align: right
  image: prof_pic.jpg
  image_circular: false # crops the image to make it circular
selected_papers: true # includes a list of papers marked as "selected={true}"
selected_projects:
  - fast-uncertainty-quantification
  - heuristic-admissible-hybrid-ilqr
  - generative-modeling-fluid-dynamics
  # add project slugs here to feature them on the homepage
social: true # includes social icons at the bottom of the page

announcements:
  enabled: false # includes a list of news items
  scrollable: true # adds a vertical scroll bar if there are more than 3 news items
  limit: 5 # leave blank to include all the news in the `_news` folder

latest_posts:
  enabled: false
  scrollable: true # adds a vertical scroll bar if there are more than 3 new posts items
  limit: 3 # leave blank to include all the blog posts
---

<strong>Robot learning. Motion planning. Control.</strong><br>
I'm a second-year M.S. student with broad research and
engineering experience in robot planning and control. I've worked on various levels
of the control stack, ranging from low-level drivers to high-level planning and policy training.
My experience spans deep/reinforcement learning, numerical optimization, CUDA programming,
and performant C++ control code across quadrupeds, drones, self-driving cars, and surgical robots.

I'm advised by [Prof. Aaron Johnson](https://www.meche.engineering.cmu.edu/directory/bios/johnson-aaron.html)
in the [Robomechanics Lab](https://www.cmu.edu/me/robomechanicslab/) and currently pursuing research
in locomotion/manipulation policy learning using differentiable simulation,
imitation learning for high-performance torque policies,
and uncertainty quantification for world models.

{% if page.selected_projects and page.selected_projects.size > 0 %}

  <h2>
    selected projects
  </h2>
  <div class="publications">
    <ol class="bibliography">
      {% for project_slug in page.selected_projects %}
        {% assign project = site.projects | where: 'slug', project_slug | first %}
        {% if project %}
          <li>
            <div class="row">
              <div class="col col-sm-2 abbr">
                {% if project.img %}
                  {% include figure.liquid loading="eager" path=project.img sizes="200px" class="preview z-depth-1 rounded" zoomable=true avoid_scaling=true alt=project.img %}
                {% endif %}
              </div>
              <div class="col-sm-8">
                <div class="title">{{ project.title }}</div>
                <div class="periodical">{{ project.description }}</div>
              </div>
            </div>
          </li>
        {% endif %}
      {% endfor %}
    </ol>
  </div>
{% endif %}
