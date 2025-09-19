// src/pages/ChatPage.js
import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import {
  getFriends,
  getRequests,
  getChat,
  searchUser,
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
} from "../utils/api";

const SOCKET_URL = process.env.NODE_ENV === "production" ? undefined : "http://localhost:5000";

export default function ChatPage() {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("user"));
    } catch {
      return null;
    }
  });
  const [friends, setFriends] = useState([]);
  const [requests, setRequests] = useState([]);
  const [activeFriend, setActiveFriend] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [searchEmail, setSearchEmail] = useState("");
  const [searchResult, setSearchResult] = useState(null);
  const [sendingRequest, setSendingRequest] = useState(false);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const socketRef = useRef(null);
  const messagesRef = useRef(null);

  useEffect(() => {
    if (!user) return;
    const socket = io(SOCKET_URL || window.location.origin, { transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("socket connected", socket.id);
      socket.emit("join", String(user.id));
    });

    socket.on("receiveMessage", (msg) => {
      // if message belongs to active convo, append
      const otherId = msg.senderId === user.id ? msg.receiverId : msg.senderId;
      if (String(activeFriend?.id) === String(otherId)) {
        setMessages((m) => [...m, msg]);
      } else {
        // optional: show notification badge for that friend
        console.log("New message from", otherId);
      }
    });

    socket.on("friendRequest", (payload) => {
      // if it's for this user, refresh requests
      fetchRequests();
    });

    socket.on("friendAccepted", (payload) => {
      // refresh friends & requests
      fetchFriends();
      fetchRequests();
    });

    socket.on("requestRejected", (payload) => {
      // refresh requests, notify sender if needed
      fetchRequests();
    });

    return () => {
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, activeFriend?.id]);

  useEffect(() => {
    if (!user) return;
    fetchFriends();
    fetchRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    // scroll to bottom when messages change
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages]);

  async function fetchFriends() {
    try {
      setLoadingFriends(true);
      const f = await getFriends(user.id);
      setFriends(f || []);
    } catch (err) {
      console.warn("getFriends", err);
    } finally {
      setLoadingFriends(false);
    }
  }

  async function fetchRequests() {
    try {
      const r = await getRequests(user.id);
      setRequests(r || []);
    } catch (err) {
      console.warn("getRequests", err);
    }
  }

  const openChatWith = async (friend) => {
    setActiveFriend(friend);
    try {
      const convo = await getChat(user.id, friend.id);
      setMessages(convo || []);
    } catch (err) {
      console.error("getChat error", err);
      setMessages([]);
    }
  };

  const sendMessage = (e) => {
    e?.preventDefault();
    if (!text.trim() || !activeFriend) return;
    const msg = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      senderId: String(user.id),
      receiverId: String(activeFriend.id),
      text: text.trim(),
      timestamp: new Date().toISOString(),
    };

    try {
      socketRef.current?.emit("sendMessage", msg);
      setMessages((m) => [...m, msg]);
      setText("");
    } catch (err) {
      console.error("sendMessage error", err);
    }
  };

  const handleSearch = async (e) => {
    e?.preventDefault();
    if (!searchEmail.trim()) return;
    try {
      const res = await searchUser(searchEmail);
      setSearchResult(res);
    } catch (err) {
      setSearchResult(null);
      alert(err.message || "User not found");
    }
  };

  const handleSendRequest = async () => {
    if (!searchResult) return;
    setSendingRequest(true);
    try {
      await sendFriendRequest(user.id, searchResult.id);
      alert("Request sent");
    } catch (err) {
      alert(err.message || "Failed to send request");
    } finally {
      setSendingRequest(false);
    }
  };

  const handleAccept = async (reqUser) => {
    try {
      await acceptFriendRequest(user.id, reqUser.id);
      // update local lists
      setRequests((r) => r.filter((x) => x.id !== reqUser.id));
      fetchFriends();
    } catch (err) {
      alert(err.message || "Failed to accept");
    }
  };

  const handleReject = async (reqUser) => {
    try {
      await rejectFriendRequest(user.id, reqUser.id);
      setRequests((r) => r.filter((x) => x.id !== reqUser.id));
    } catch (err) {
      alert(err.message || "Failed to reject");
    }
  };

  if (!user) {
    return (
      <div className="p-6">
        <h2 className="text-lg">Please login or signup to use chat</h2>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-screen">
      {/* Left / Top panel: friends + requests + search */}
      <aside className="md:w-80 w-full md:h-full h-auto border-r p-3 bg-white flex-shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-sm text-gray-500">Logged in as</div>
            <div className="font-semibold">{user.username}</div>
          </div>
          <div>
            <button
              className="text-xs text-red-500"
              onClick={() => {
                localStorage.removeItem("user");
                window.location.reload();
              }}
            >
              Logout
            </button>
          </div>
        </div>

        {/* Search by email */}
        <form onSubmit={handleSearch} className="mb-3">
          <div className="flex gap-2">
            <input
              className="flex-1 p-2 border rounded"
              placeholder="Find by email"
              value={searchEmail}
              onChange={(e) => setSearchEmail(e.target.value)}
            />
            <button className="px-3 bg-blue-600 text-white rounded" type="submit">Search</button>
          </div>
          {searchResult && (
            <div className="mt-2 p-2 border rounded bg-gray-50">
              <div className="text-sm font-medium">{searchResult.username}</div>
              <div className="text-xs text-gray-500">{searchResult.email}</div>
              <div className="mt-2">
                <button
                  onClick={handleSendRequest}
                  disabled={sendingRequest || searchResult.id === String(user.id)}
                  className="text-sm px-3 py-1 bg-green-600 text-white rounded disabled:opacity-60"
                >
                  {searchResult.id === String(user.id) ? "It's you" : sendingRequest ? "Sending..." : "Send Request"}
                </button>
              </div>
            </div>
          )}
        </form>

        <div className="mb-3">
          <div className="font-semibold mb-2">Requests</div>
          {requests.length === 0 ? (
            <div className="text-sm text-gray-500">No requests</div>
          ) : (
            <ul className="space-y-2">
              {requests.map((r) => (
                <li key={r.id} className="flex items-center justify-between p-2 border rounded">
                  <div>
                    <div className="font-medium">{r.username}</div>
                    <div className="text-xs text-gray-500">{r.email}</div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => handleAccept(r)} className="px-2 py-1 bg-blue-600 text-white rounded text-sm">Accept</button>
                    <button onClick={() => handleReject(r)} className="px-2 py-1 bg-gray-200 rounded text-sm">Reject</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <div className="font-semibold mb-2">Friends</div>
          {loadingFriends ? (
            <div className="text-sm text-gray-500">Loading...</div>
          ) : friends.length === 0 ? (
            <div className="text-sm text-gray-500">No friends yet</div>
          ) : (
            <ul className="space-y-1">
              {friends.map((f) => (
                <li key={f.id}>
                  <button
                    onClick={() => openChatWith(f)}
                    className={`w-full text-left p-2 rounded ${activeFriend?.id === f.id ? "bg-gray-200" : "hover:bg-gray-100"}`}
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="font-medium">{f.username}</div>
                        <div className="text-xs text-gray-500">{f.email}</div>
                      </div>
                      <div className="text-xs text-gray-400">{/* optional badge */}</div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* Chat area */}
      <main className="flex-1 flex flex-col bg-gray-50">
        <div className="border-b p-3 bg-white">
          <div className="text-sm text-gray-600">
            {activeFriend ? `Chat with ${activeFriend.username}` : "Select a friend to start chatting"}
          </div>
        </div>

        <div ref={messagesRef} className="flex-1 overflow-auto p-4 space-y-3">
          {!activeFriend ? (
            <div className="text-center text-gray-500 mt-8">Select a friend to start chatting</div>
          ) : messages.length === 0 ? (
            <div className="text-center text-gray-400 mt-8">No messages yet. Say hi!</div>
          ) : (
            messages.map((m) => (
              <div key={m.id} className={`max-w-xs p-2 rounded ${String(m.senderId) === String(user.id) ? "ml-auto bg-blue-600 text-white" : "bg-white"}`}>
                <div className="text-sm">{m.text}</div>
                <div className="text-[10px] mt-1 opacity-80">{new Date(m.timestamp).toLocaleString()}</div>
              </div>
            ))
          )}
        </div>

        <form onSubmit={sendMessage} className="p-3 border-t bg-white flex gap-2">
          <input
            className="flex-1 p-2 border rounded"
            placeholder={activeFriend ? `Message ${activeFriend.username}` : "Select a friend to message"}
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={!activeFriend}
          />
          <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded" disabled={!activeFriend || !text.trim()}>
            Send
          </button>
        </form>
      </main>
    </div>
  );
}
