---
layout: page
title: experience
permalink: /experience/
nav: true
nav_order: 2
cv: true
---

{% if site.plugins contains 'al_folio_cv' and site.al_folio.features.cv.enabled != false and site.data.cv and site.data.cv.cv and site.data.cv.cv.sections.Experience %}
{% assign entries = site.data.cv.cv.sections.Experience | where_exp: 'entry', "entry.position contains 'Intern'" | al_cv_sort_by_date %}
{% if entries.size > 0 %}

<div class="cv">
{% include cv/experience.liquid %}
</div>
{% endif %}
{% endif %}
