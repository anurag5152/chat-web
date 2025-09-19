// src/pages/ChatPage.js
import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { getFriends, getChat } from "../utils/api";

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
  const [activeFriend, setActiveFriend] = useState(null);
  const [messages, setMessages] = useState([]); // current convo
  const [text, setText] = useState("");
  const socketRef = useRef(null);
  const messagesRef = useRef(null);

  useEffect(() => {
    if (!user) return;
    // connect socket
    const socket = io(SOCKET_URL || window.location.origin, { transports: ["websocket", "polling"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("socket connected", socket.id);
      // join user's room so server can send real-time events
      socket.emit("join", String(user.id));
    });

    socket.on("receiveMessage", (msg) => {
      // if this message belongs to current convo, append
      const otherId = msg.senderId === user.id ? msg.receiverId : msg.senderId;
      const activeId = activeFriend?.id;
      // If message belongs to active friend, update messages
      if (String(otherId) === String(activeId)) {
        setMessages((m) => [...m, msg]);
      } else {
        // optionally: show notification or update friends list
        console.log("new message from other user", otherId);
      }
    });

    return () => {
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, activeFriend?.id]);

  useEffect(() => {
    if (!user) return;
    // fetch friends list (optional)
    getFriends(user.id)
      .then((f) => setFriends(f))
      .catch((e) => console.warn("getFriends error", e.message || e));
  }, [user]);

  useEffect(() => {
    // scroll to bottom when messages change
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages]);

  const openChatWith = async (friend) => {
    setActiveFriend(friend);
    // fetch chat from server
    try {
      const convo = await getChat(user.id, friend.id);
      setMessages(convo || []);
    } catch (err) {
      console.error("getChat error", err.message || err);
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

    // emit via socket
    try {
      socketRef.current?.emit("sendMessage", msg);
      // optimistically append
      setMessages((m) => [...m, msg]);
      setText("");
    } catch (err) {
      console.error("sendMessage emit failed:", err);
    }
  };

  if (!user) {
    return (
      <div className="p-8">
        <h2>Please login or signup to use chat</h2>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      <aside className="w-1/4 border-r p-4">
        <h3 className="text-lg font-bold mb-4">Logged in as {user.username}</h3>
        <div>
          <h4 className="font-semibold">Friends</h4>
          <ul>
            {friends.map((f) => (
              <li key={f.id}>
                <button
                  onClick={() => openChatWith(f)}
                  className={`w-full text-left p-2 rounded ${activeFriend?.id === f.id ? "bg-gray-200" : ""}`}
                >
                  {f.username} ({f.email})
                </button>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <main className="flex-1 flex flex-col">
        <div className="flex-1 overflow-auto p-4" ref={messagesRef} style={{ background: "#f7f7f7" }}>
          {!activeFriend ? (
            <div className="text-center text-gray-500 mt-20">Select a friend to start chatting</div>
          ) : (
            <>
              <h4 className="font-bold mb-4">Chat with {activeFriend.username}</h4>
              <div className="space-y-3">
                {messages.map((m) => (
                  <div key={m.id} className={`p-2 rounded max-w-xs ${String(m.senderId) === String(user.id) ? "ml-auto bg-blue-500 text-white" : "bg-white"}`}>
                    <div style={{ fontSize: 14 }}>{m.text}</div>
                    <div style={{ fontSize: 11, marginTop: 4, opacity: 0.7 }}>{new Date(m.timestamp).toLocaleString()}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <form onSubmit={sendMessage} className="p-4 border-t flex items-center gap-2">
          <input
            className="flex-1 p-2 border rounded"
            placeholder={activeFriend ? `Message ${activeFriend.username}` : "Select a friend to message"}
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={!activeFriend}
          />
          <button type="submit" className="bg-blue-600 text-white p-2 rounded" disabled={!activeFriend || !text.trim()}>
            Send
          </button>
        </form>
      </main>
    </div>
  );
}
