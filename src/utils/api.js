// src/utils/api.js
const API_URL =
  process.env.NODE_ENV === "production" ? "/api" : "http://localhost:5000/api";

async function handleRes(res) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message || "Request failed");
  return json;
}

export const signup = async (userData) => {
  const body = { ...userData, email: userData.email?.trim().toLowerCase() };
  const res = await fetch(`${API_URL}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return handleRes(res);
};

export const login = async (userData) => {
  const body = { ...userData, email: userData.email?.trim().toLowerCase() };
  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return handleRes(res);
};

export const getUser = async (userId) => {
  const res = await fetch(`${API_URL}/users/${userId}`);
  return handleRes(res);
};

export const searchUser = async (email) => {
  const res = await fetch(`${API_URL}/friends/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: email?.trim().toLowerCase() }),
  });
  return handleRes(res);
};

export const sendFriendRequest = async (fromId, toId) => {
  const res = await fetch(`${API_URL}/friends/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fromId, toId }),
  });
  return handleRes(res);
};

export const acceptFriendRequest = async (userId, friendId) => {
  const res = await fetch(`${API_URL}/friends/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, friendId }),
  });
  return handleRes(res);
};

export const rejectFriendRequest = async (userId, friendId) => {
  const res = await fetch(`${API_URL}/friends/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, friendId }),
  });
  return handleRes(res);
};

export const getFriends = async (userId) => {
  const res = await fetch(`${API_URL}/friends/${userId}`);
  return handleRes(res);
};

export const getRequests = async (userId) => {
  const res = await fetch(`${API_URL}/requests/${userId}`);
  return handleRes(res);
};

export const getChat = async (userId, friendId) => {
  const res = await fetch(`${API_URL}/chat/${userId}/${friendId}`);
  return handleRes(res);
};
