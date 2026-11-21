# CodeAlpha_SocialMediaPlatform
Mini social media app built for the **CodeAlpha Full Stack Development Internship - Task 2**.

## Features
- User registration & login (bcrypt-hashed passwords, JWT auth)
- User profiles with editable bio, follower / following counts
- Create / delete posts (280 chars), comments on posts
- Like / unlike posts
- Follow / unfollow users; "Following" feed and "Everyone" feed

## Tech Stack
- Frontend: HTML, CSS, vanilla JavaScript
- Backend: Node.js + Express.js
- Database: SQLite (better-sqlite3) - tables: users, posts, comments, likes, follows

## Run locally
```bash
npm install
npm start
# open http://localhost:3000
```
Register two accounts (use a second browser/incognito), follow each other, post, like and comment.

## REST API
| Method | Endpoint | Purpose |
|---|---|---|
| POST | /api/register, /api/login | Auth |
| GET | /api/users/:username | Profile + counts |
| PUT | /api/profile | Update bio |
| POST | /api/users/:id/follow | Toggle follow |
| POST | /api/posts | Create post |
| GET | /api/feed?scope=all | Feed |
| DELETE | /api/posts/:id | Delete own post |
| POST | /api/posts/:id/like | Toggle like |
| GET/POST | /api/posts/:id/comments | Comments |
