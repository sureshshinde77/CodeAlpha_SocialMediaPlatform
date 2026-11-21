const app = document.getElementById('app');
let token = localStorage.getItem('token');
let me = JSON.parse(localStorage.getItem('user') || 'null');

// ---------- helpers ----------
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(url, method = 'GET', body) {
  const res = await fetch('/api' + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json();
  if (res.status === 401 && token) logout();
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}
function logout() { localStorage.clear(); token = null; me = null; showAuth(); }

document.getElementById('homeLink').onclick = e => { e.preventDefault(); showFeed(); };
document.getElementById('logo').onclick = () => token && showFeed();
document.getElementById('meLink').onclick = e => { e.preventDefault(); showProfile(me.username); };
document.getElementById('logoutLink').onclick = e => { e.preventDefault(); logout(); };

// ---------- auth screen ----------
function showAuth() {
  document.getElementById('nav').hidden = true;
  app.innerHTML = `
    <div class="card">
      <h2>Welcome to Chirp</h2>
      <input id="u" placeholder="Username">
      <input id="p" type="password" placeholder="Password (6+ chars)">
      <p class="error" id="err"></p>
      <button id="login">Login</button> <button id="reg" class="outline">Register</button>
    </div>`;
  const go = async path => {
    try {
      const d = await api(path, 'POST', { username: u.value.trim(), password: p.value });
      token = d.token; me = d.user;
      localStorage.setItem('token', token); localStorage.setItem('user', JSON.stringify(me));
      showFeed();
    } catch (e) { document.getElementById('err').textContent = e.message; }
  };
  document.getElementById('login').onclick = () => go('/login');
  document.getElementById('reg').onclick = () => go('/register');
}

// ---------- post rendering ----------
function postHTML(p) {
  return `<div class="card" data-id="${p.id}">
    <div class="post-head">
      <span class="user" data-user="${esc(p.username)}">@${esc(p.username)}</span>
      <span class="time">${new Date(p.created_at + 'Z').toLocaleString()}</span>
    </div>
    <p>${esc(p.content)}</p>
    <div class="actions">
      <button class="ghost like ${p.liked ? 'on' : ''}">${p.liked ? '❤️' : '🤍'} ${p.likes}</button>
      <button class="ghost cmt">💬 ${p.comments}</button>
      ${p.user_id === me.id ? '<button class="ghost del">🗑 Delete</button>' : ''}
    </div>
    <div class="comments" hidden></div>
  </div>`;
}

function bindPosts(container, reload) {
  container.querySelectorAll('.user').forEach(el => el.onclick = () => showProfile(el.dataset.user));
  container.querySelectorAll('.card[data-id]').forEach(card => {
    const id = card.dataset.id;
    card.querySelector('.like').onclick = async () => { await api(`/posts/${id}/like`, 'POST'); reload(); };
    const del = card.querySelector('.del');
    if (del) del.onclick = async () => { if (confirm('Delete post?')) { await api(`/posts/${id}`, 'DELETE'); reload(); } };
    card.querySelector('.cmt').onclick = () => toggleComments(card, id, reload);
  });
}

async function toggleComments(card, id, reload) {
  const box = card.querySelector('.comments');
  if (!box.hidden) { box.hidden = true; return; }
  const list = await api(`/posts/${id}/comments`);
  box.innerHTML = list.map(c => `<div class="comment"><b>@${esc(c.username)}</b> ${esc(c.content)}</div>`).join('') +
    `<input placeholder="Write a comment..." class="cin"><button class="csend">Reply</button>`;
  box.hidden = false;
  box.querySelector('.csend').onclick = async () => {
    const v = box.querySelector('.cin').value;
    if (!v.trim()) return;
    await api(`/posts/${id}/comments`, 'POST', { content: v });
    await reload();
  };
}

// ---------- feed ----------
async function showFeed(scope = 'following') {
  document.getElementById('nav').hidden = false;
  const [posts, people] = await Promise.all([
    api('/feed' + (scope === 'all' ? '?scope=all' : '')), api('/users')
  ]);
  app.innerHTML = `
    <div class="card">
      <textarea id="content" maxlength="280" rows="3" placeholder="What's happening?"></textarea>
      <button id="post">Post</button> <span class="error" id="err"></span>
    </div>
    <div class="tabs">
      <button class="${scope === 'following' ? '' : 'outline'}" id="t1">Following</button>
      <button class="${scope === 'all' ? '' : 'outline'}" id="t2">Everyone</button>
    </div>
    <div class="card"><b>People to follow</b><br>
      ${people.map(u => `<span class="user" data-user="${esc(u.username)}">@${esc(u.username)}</span> `).join('') || '<span class="muted">No other users yet</span>'}
    </div>
    <div id="posts">${posts.map(postHTML).join('') || '<p class="muted">Nothing here yet. Follow someone or post something!</p>'}</div>`;
  document.getElementById('post').onclick = async () => {
    try { await api('/posts', 'POST', { content: content.value }); showFeed(scope); }
    catch (e) { document.getElementById('err').textContent = e.message; }
  };
  document.getElementById('t1').onclick = () => showFeed('following');
  document.getElementById('t2').onclick = () => showFeed('all');
  bindPosts(app, () => showFeed(scope));
}

// ---------- profile ----------
async function showProfile(username) {
  const [u, posts] = await Promise.all([api('/users/' + username), api(`/users/${username}/posts`)]);
  const own = u.id === me.id;
  app.innerHTML = `
    <div class="card">
      <h2>@${esc(u.username)}</h2>
      <p id="bio">${esc(u.bio) || '<span class="muted">No bio yet</span>'}</p>
      <div class="stats"><span><b>${u.followers}</b> Followers</span><span><b>${u.following}</b> Following</span></div><br>
      ${own ? '<button id="editBio" class="outline">Edit bio</button>'
            : `<button id="follow" class="${u.isFollowing ? 'outline' : ''}">${u.isFollowing ? 'Unfollow' : 'Follow'}</button>`}
    </div>
    <div id="posts">${posts.map(postHTML).join('') || '<p class="muted">No posts yet</p>'}</div>`;
  if (own) document.getElementById('editBio').onclick = async () => {
    const b = prompt('Your bio (max 160 chars):', u.bio);
    if (b !== null) { await api('/profile', 'PUT', { bio: b }); showProfile(username); }
  };
  else document.getElementById('follow').onclick = async () => { await api(`/users/${u.id}/follow`, 'POST'); showProfile(username); };
  bindPosts(app, () => showProfile(username));
}

// ---------- start ----------
token ? showFeed() : showAuth();
