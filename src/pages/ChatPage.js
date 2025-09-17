// src/pages/ChatPage.js
import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { io } from "socket.io-client";
import {
  searchUser,
  sendFriendRequest,
  acceptFriendRequest,
  getFriends,
  getRequests,
  getChat,
  getUser,
} from "../utils/api";

const SOCKET_URL = "http://localhost:5000";
const socket = io(SOCKET_URL, { autoConnect: false }); // singleton

export default function ChatPage() {
  const navigate = useNavigate();
  const stored = localStorage.getItem("user");
  const currentUser = stored ? JSON.parse(stored) : null;

  const [friends, setFriends] = useState([]);
  const [requests, setRequests] = useState([]);
  const [searchEmail, setSearchEmail] = useState("");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [activeFriend, setActiveFriend] = useState(null);

  const messagesEndRef = useRef(null);
  const msgIdSetRef = useRef(new Set()); // dedupe by id
  const activeFriendRef = useRef(activeFriend);

  useEffect(() => {
    activeFriendRef.current = activeFriend;
  }, [activeFriend]);

  // load friends & requests (skip server calls for guest accounts)
  const loadFriends = async () => {
    if (!currentUser) return;
    if (String(currentUser.id).startsWith("guest_")) {
      setFriends([]);
      return;
    }
    try {
      const f = await getFriends(currentUser.id);
      setFriends(f || []);
    } catch (err) {
      console.error(err);
    }
  };
  const loadRequests = async () => {
    if (!currentUser) return;
    if (String(currentUser.id).startsWith("guest_")) {
      setRequests([]);
      return;
    }
    try {
      const r = await getRequests(currentUser.id);
      setRequests(r || []);
    } catch (err) {
      console.error(err);
    }
  };

  // connect socket and register listeners ONCE
  useEffect(() => {
    if (!currentUser) {
      navigate("/");
      return;
    }

    if (!socket.connected) socket.connect();
    socket.emit("join", String(currentUser.id));

    // receive messages
    const handleReceive = (msg) => {
      const senderId = String(msg.senderId);
      const receiverId = String(msg.receiverId);
      const activeId = activeFriendRef.current ? String(activeFriendRef.current.id) : null;

      if (msg.id && msgIdSetRef.current.has(msg.id)) return;
      if (msg.id) msgIdSetRef.current.add(msg.id);

      const chatId = [String(currentUser.id), activeId].sort().join("-");
      const msgChatId = [senderId, receiverId].sort().join("-");

      if (activeId && chatId === msgChatId) {
        setMessages((prev) => [...prev, msg]);
      } else {
        console.log("Message arrived for other chat", msg);
      }
    };

    const handleFriendRequest = (payload) => {
      if (!payload || !payload.fromUser) return;
      const fromUser = payload.fromUser;
      setRequests((prev) => {
        if (prev.find((r) => String(r.id) === String(fromUser.id))) return prev;
        return [fromUser, ...prev];
      });
    };

    const handleFriendAccepted = async () => {
      await loadFriends();
      await loadRequests();
      try {
        const updated = await getUser(currentUser.id);
        localStorage.setItem("user", JSON.stringify(updated));
      } catch (err) {}
    };

    socket.on("receiveMessage", handleReceive);
    socket.on("friendRequest", handleFriendRequest);
    socket.on("friendAccepted", handleFriendAccepted);

    // initial load
    loadFriends();
    loadRequests();

    return () => {
      socket.off("receiveMessage", handleReceive);
      socket.off("friendRequest", handleFriendRequest);
      socket.off("friendAccepted", handleFriendAccepted);
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once

  // scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages]);

  // open chat and load history
  const openChat = async (friend) => {
    setActiveFriend(friend);
    setMessages([]);
    msgIdSetRef.current.clear();
    try {
      if (String(currentUser.id).startsWith("guest_")) {
        // guest has no server history
        setMessages([]);
        return;
      }
      const history = await getChat(currentUser.id, friend.id);
      const uniq = [];
      for (const m of history || []) {
        if (m.id && msgIdSetRef.current.has(m.id)) continue;
        if (m.id) msgIdSetRef.current.add(m.id);
        uniq.push(m);
      }
      setMessages(uniq);
    } catch (err) {
      console.error("getChat error", err);
    }
  };

  // send message
  const handleSend = async (e) => {
    e?.preventDefault();
    if (!input.trim() || !activeFriend) return;

    const msg = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      senderId: String(currentUser.id),
      receiverId: String(activeFriend.id),
      text: input.trim(),
      timestamp: new Date().toISOString(),
    };

    msgIdSetRef.current.add(msg.id);
    setMessages((prev) => [...prev, msg]);

    // For guest users: still emit over socket so other guest tabs or users can get it (but they won't be in server users list)
    socket.emit("sendMessage", msg);

    setInput("");
  };

  const handleSearch = async (e) => {
    e?.preventDefault();
    if (!searchEmail.trim()) return;
    if (String(currentUser.id).startsWith("guest_")) {
      alert("Guest users cannot send friend requests. Please sign up to add friends.");
      return;
    }
    try {
      const found = await searchUser(searchEmail.trim());
      if (!found) {
        alert("User not found");
        return;
      }
      if (String(found.id) === String(currentUser.id)) {
        alert("Cannot add yourself");
        return;
      }
      await sendFriendRequest(currentUser.id, found.id);
      alert("Friend request sent");
      setSearchEmail("");
    } catch (err) {
      alert(err.message || "Error");
    }
  };

  const handleAccept = async (friendId) => {
    try {
      await acceptFriendRequest(currentUser.id, friendId);
      setRequests((prev) => prev.filter((r) => String(r.id) !== String(friendId)));
      await loadFriends();
      try {
        const updated = await getUser(currentUser.id);
        localStorage.setItem("user", JSON.stringify(updated));
      } catch (err) {}
    } catch (err) {
      alert(err.message || "Error accepting");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("user");
    navigate("/");
  };

  return (
    <div className="flex flex-col h-screen">
      <div className="flex justify-between items-center bg-blue-600 text-white p-4">
        <h1 className="text-2xl font-bold">ChatConnect</h1>
        <div className="flex items-center gap-4">
          <div>{currentUser?.username}</div>
          <button
            onClick={handleLogout}
            className="bg-white text-blue-600 px-4 py-2 rounded-lg hover:bg-gray-200 transition"
          >
            Logout
          </button>
        </div>
      </div>

      <div className="flex flex-1">
        {/* Sidebar */}
        <div className="w-1/4 bg-gray-100 border-r p-4 overflow-y-auto">
          <h2 className="font-bold text-lg mb-2">Friends</h2>
          <ul>
            {friends.map((f) => (
              <li
                key={f.id}
                className={`p-2 mb-2 rounded-lg cursor-pointer ${
                  activeFriend?.id === f.id ? "bg-blue-200" : "hover:bg-gray-200"
                }`}
                onClick={() => openChat(f)}
              >
                <div className="font-medium">{f.username}</div>
                <div className="text-xs text-gray-500">{f.email}</div>
              </li>
            ))}
            {friends.length === 0 && <div className="text-sm text-gray-500">No friends yet</div>}
          </ul>

          <h2 className="font-bold text-lg mt-6 mb-2">Requests</h2>
          <ul>
            {requests.map((r) => (
              <li key={r.id} className="flex justify-between items-center mb-2">
                <div>
                  <div className="font-medium">{r.username}</div>
                  <div className="text-xs text-gray-500">{r.email}</div>
                </div>
                <button
                  onClick={() => handleAccept(r.id)}
                  className="bg-green-500 text-white px-2 py-1 rounded"
                >
                  Accept
                </button>
              </li>
            ))}
            {requests.length === 0 && <div className="text-sm text-gray-500">No requests</div>}
          </ul>

          <form onSubmit={handleSearch} className="mt-6">
            <input
              type="email"
              value={searchEmail}
              onChange={(e) => setSearchEmail(e.target.value)}
              placeholder="Search by email"
              className="w-full p-2 border rounded mb-2"
            />
            <button type="submit" className="w-full bg-blue-600 text-white py-2 rounded">
              Add Friend
            </button>
          </form>
        </div>

        {/* Chat Area */}
        <div className="w-3/4 flex flex-col">
          {activeFriend ? (
            <>
              <div className="p-4 border-b">
                <div className="text-lg font-semibold">{activeFriend.username}</div>
                <div className="text-sm text-gray-500">{activeFriend.email}</div>
              </div>

              <div className="flex-1 p-4 overflow-y-auto bg-gray-50" id="chat-scroll">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`mb-2 flex ${String(msg.senderId) === String(currentUser.id) ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`p-3 rounded-lg max-w-xs break-words ${
                        String(msg.senderId) === String(currentUser.id) ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-800"
                      }`}
                    >
                      {msg.text}
                      <div className="text-xs text-gray-400 mt-1">
                        {new Date(msg.timestamp || Date.now()).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              <form onSubmit={handleSend} className="flex p-4 bg-white border-t">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button type="submit" className="ml-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition">
                  Send
                </button>
              </form>
            </>
          ) : (
            <div className="flex items-center justify-center flex-1 text-gray-500">
              Select a friend to start chatting
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
