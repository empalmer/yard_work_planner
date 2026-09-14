# Yard Work Planner

A small Express-based app for tracking yard sections, plants, sun/shade patterns, work history, and maintenance tasks.

## Features

- Visual yard layout with selectable sections
- Track plants in each section
- Log work dates for each area
- Record sun and shade windows by time of day
- Maintain a task list that can be assigned to sections
- Local JSON storage for quick personal use

## Tech Stack

- Node.js
- Express
- Vanilla JavaScript + HTML + CSS

## Local Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the app:
   ```bash
   npm start
   ```
3. Open the app in your browser:
   ```text
   http://localhost:3000
   ```

## Project Structure

- `server.js` — Express server and API routes
- `public/` — browser UI assets
- `data.json` — persisted app data

## GitHub Publishing Notes

This repo is ready for GitHub publishing as a simple personal project.

- The app runs locally with a standard Node.js install.
- `data.json` is ignored by Git so personal garden data is not pushed to the repository.
- If you want to include a starter dataset, add a sample file and rename it before use.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.
