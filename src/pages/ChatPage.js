import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function ChatPage() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState([
    { id: 1, text: "Hey there! 👋", sender: "friend" },
    { id: 2, text: "Hi! This is guest mode 😃", sender: "me" },
  ]);
  const [input, setInput] = useState("");

  const handleSend = (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    setMessages([...messages, { id: Date.now(), text: input, sender: "me" }]);
    setInput("");
  };

  return (
    <div className="flex flex-col h-screen">
      <div className="flex justify-between items-center bg-blue-600 text-white p-4">
        <h1 className="text-2xl font-bold">ChatConnect</h1>
        <button
          onClick={() => navigate("/signup")}
          className="bg-white text-blue-600 px-4 py-2 rounded-lg hover:bg-gray-200 transition"
        >
          Logout
        </button>
      </div>

      <div className="flex flex-1">
        <div className="w-1/4 bg-gray-100 border-r p-4">
          <h2 className="font-bold text-lg mb-4">Friends</h2>
          <ul>
            <li className="p-2 mb-2 rounded-lg cursor-pointer bg-blue-100">
              John Doe
            </li>
            <li className="p-2 mb-2 rounded-lg cursor-pointer hover:bg-gray-200">
              Jane Smith
            </li>
          </ul>
        </div>

        <div className="w-3/4 flex flex-col">
          <div className="flex-1 p-4 overflow-y-auto bg-gray-50">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`mb-2 flex ${
                  msg.sender === "me" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`p-3 rounded-lg max-w-xs ${
                    msg.sender === "me"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 text-gray-800"
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}
          </div>

          <form onSubmit={handleSend} className="flex p-4 bg-white border-t">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message..."
              className="flex-1 p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              className="ml-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
