# Rota

A fourteen-day, three-shift workforce planner with availability, auto-fill, drag-and-drop assignment, conflict checks and CSV export. Built with plain HTML, CSS and JavaScript.

**Live demo:** https://ayo-2010.github.io/rota/

## Features

- Fourteen-day board covering morning, evening and night shifts
- Team roster with roles, shift limits, days off and colours
- Add, edit and delete team members through a dialog
- Auto-fill that respects days off, maximum shifts and the night-to-morning guard
- Drag a teammate onto a shift, or select a shift and choose an available person
- Coverage ring, filled slots, open shifts, total hours, fairness range and weekend balance
- Conflict checks for double bookings, limits, night-to-morning turns and open shifts
- Undo, clear board, cycle start date and weekend balancing controls
- Export the rota as a CSV file
- Everything saved in localStorage
- Responsive layout down to 390px, reduced motion support and a global `[hidden]` rule

## Running it

Open `index.html` in a browser. There is no build step and no dependencies to install.

## Files

```
index.html
styles.css
app.js
```

## Tech

Plain HTML, CSS and JavaScript with the HTML Drag and Drop API.
