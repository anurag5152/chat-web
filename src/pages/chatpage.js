// Chatpage.jsx
import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';

// Set REACT_APP_SOCKET_URL in .env for deployed backend (use https in production)
const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 'http://localhost:5000';

const Chatpage = () => {
  // --- Core state ---
  const [currentUser, setCurrentUser] = useState(null);
  const [friends, setFriends] = useState([]); // { id, name, email }
  const [friendRequests, setFriendRequests] = useState([]); // { id, sender_id, name, email }
  const [activeChat, setActiveChat] = useState(null); // friend object
  const [messages, setMessages] = useState([]); // messages for active chat
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
  const [unreadMap, setUnreadMap] = useState({}); // friendId -> count

  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);
  const activeChatRef = useRef(activeChat);
  useEffect(() => { activeChatRef.current = activeChat; }, [activeChat]);

  // helper to include credentials
  const authFetch = (url, options = {}) => {
    return fetch(url, { credentials: 'include', ...options });
  };

  // --- initial load: session, friends, requests ---
  useEffect(() => {
    let cancelled = false;
    const loadAll = async () => {
      try {
        const sessionRes = await authFetch('/api/session');
        const sessionData = await sessionRes.json();
        if (!sessionData.loggedIn) {
          window.location.href = '/login';
          return;
        }
        if (cancelled) return;
        setCurrentUser(sessionData.user);

        // load friends & requests immediately
        await Promise.all([fetchFriends(), fetchFriendRequests()]);
      } catch (err) {
        console.error('Initial load failed:', err);
      }
    };
    loadAll();
    return () => { cancelled = true; };
  }, []);

  // --- Fetch helpers ---
  const fetchFriends = async () => {
    try {
      const res = await authFetch('/api/friends');
      if (!res.ok) {
        console.error('/api/friends error', res.status);
        return;
      }
      const data = await res.json();
      setFriends(Array.isArray(data) ? data : []);
      // clear unread for removed friends
      setUnreadMap(prev => {
        const next = {};
        (Array.isArray(data) ? data : []).forEach(f => {
          if (prev[f.id]) next[f.id] = prev[f.id];
        });
        return next;
      });
    } catch (err) {
      console.error('fetchFriends error', err);
    }
  };

  const fetchFriendRequests = async () => {
    try {
      const res = await authFetch('/api/friend-requests');
      if (!res.ok) {
        console.error('/api/friend-requests error', res.status);
        return;
      }
      const data = await res.json();
      setFriendRequests(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('fetchFriendRequests error', err);
    }
  };

  // load messages for active friend (single definition — no duplicates)
  const fetchMessagesForFriend = async (friendId) => {
    setLoadingMessages(true);
    try {
      const res = await authFetch(`/api/messages/${friendId}`);
      if (!res.ok) {
        console.error('/api/messages error', res.status);
        setMessages([]);
        return;
      }
      const data = await res.json();
      setMessages(Array.isArray(data) ? data : []);
      // reset unread count for this friend
      setUnreadMap(prev => {
        const copy = { ...prev };
        delete copy[friendId];
        return copy;
      });
    } catch (err) {
      console.error('fetchMessagesForFriend error', err);
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  };

  // --- Socket lifecycle: create when currentUser is available ---
  useEffect(() => {
    if (!currentUser) return;

    // cleanup existing socket if any
    if (socketRef.current) {
      try { socketRef.current.disconnect(); } catch (e) {}
      socketRef.current = null;
    }

    // create socket with reconnect and credentials
    const socket = io(SOCKET_URL, {
      withCredentials: true,
      transports: ['websocket'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;
    // expose for debugging in console
    window._chatSocket = socket;

    console.log('[chat] socket attempting connect to', SOCKET_URL);

    // attach events
    const onConnect = () => {
      console.log('[chat] Socket connected', socket.id);
      setSocketConnected(true);
      // re-sync friends & requests on reconnect so UI matches DB
      fetchFriends();
      fetchFriendRequests();
      // if active chat exists, refresh messages (in case of missed messages)
      if (activeChatRef.current) fetchMessagesForFriend(activeChatRef.current.id);
    };
    const onDisconnect = (reason) => {
      console.warn('[chat] Socket disconnected', reason);
      setSocketConnected(false);
    };
    const onConnectError = (err) => {
      console.error('[chat] connect_error', err);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);

    // When someone sends a friend request to me -> re-fetch friend-requests list
    const handleNewFriendRequest = (request) => {
      fetchFriendRequests();
      console.log('[chat] new_friend_request', request);
    };
    socket.on('new_friend_request', handleNewFriendRequest);

    // When someone accepts my friend request -> re-fetch friends
    const handleFriendRequestAccepted = (newFriend) => {
      fetchFriends();
      console.log('[chat] friend_request_accepted', newFriend);
    };
    socket.on('friend_request_accepted', handleFriendRequestAccepted);

    // When someone removes me as a friend -> re-fetch friends
    const handleFriendRemoved = ({ friendId }) => {
      console.log('[chat] friend_removed', friendId);
      fetchFriends();
      setActiveChat(prev => {
        if (prev && prev.id === friendId) {
          setMessages([]);
          return null;
        }
        return prev;
      });
    };
    socket.on('friend_removed', handleFriendRemoved);

    // Private message handler
    const handlePrivateMessage = (message) => {
      console.log('[chat] private_message received', message);

      setMessages(prev => {
        // avoid duplicates
        if (prev.find(m => m.id === message.id)) return prev;

        const active = activeChatRef.current;

        // If belongs to active chat, append
        if (active && (message.sender_id === active.id || message.receiver_id === active.id)) {
          return [...prev, message];
        }

        // Not active: no change to messages array for active chat
        return prev;
      });

      // increment unread count if message is for some friend who is not active
      const otherId = message.sender_id === currentUser.id ? message.receiver_id : message.sender_id;
      const activeId = activeChatRef.current ? activeChatRef.current.id : null;
      if (otherId && otherId !== activeId) {
        setUnreadMap(prev => {
          const prevCount = prev[otherId] || 0;
          return { ...prev, [otherId]: prevCount + 1 };
        });
      }
    };
    socket.on('private_message', handlePrivateMessage);

    // cleanup on unmount/change
    return () => {
      try {
        socket.off('connect', onConnect);
        socket.off('disconnect', onDisconnect);
        socket.off('connect_error', onConnectError);
        socket.off('new_friend_request', handleNewFriendRequest);
        socket.off('friend_request_accepted', handleFriendRequestAccepted);
        socket.off('friend_removed', handleFriendRemoved);
        socket.off('private_message', handlePrivateMessage);
        socket.disconnect();
      } catch (e) {}
      window._chatSocket = null;
      socketRef.current = null;
      setSocketConnected(false);
    };
  }, [currentUser]); // recreate socket only when user changes (login/logout)

  // scroll on messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // --- search users ---
  useEffect(() => {
    const t = setTimeout(async () => {
      if (searchQuery.trim() === '') {
        setSearchResults([]);
        return;
      }
      try {
        const res = await authFetch(`/api/users/search?email=${encodeURIComponent(searchQuery)}`);
        if (!res.ok) {
          console.error('search error', res.status);
          return;
        }
        const data = await res.json();
        setSearchResults(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('search failed', err);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // --- interactions: select friend, send message, friend-request actions ---

  const selectFriend = async (friend) => {
    setActiveChat(friend);
    setMessages([]);
    setLoadingMessages(true);
    try {
      await fetchMessagesForFriend(friend.id); // calls the single defined function above
    } finally {
      setLoadingMessages(false);
      setSidebarOpen(false);
    }
  };

  const handleSendMessage = () => {
    if (!newMessage.trim() || !activeChat || !currentUser) return;

    const socket = socketRef.current;
    if (!socket || !socket.connected) {
      console.error('Socket not connected - cannot send. Trying to reconnect...');
      if (socket) socket.connect();
      return;
    }

    const tempId = uuidv4();
    const optimistic = {
      id: tempId,
      sender_id: currentUser.id,
      receiver_id: activeChat.id,
      content: newMessage,
      timestamp: new Date().toISOString(),
    };

    // append optimistic
    setMessages(prev => [...prev, optimistic]);

    const payload = {
      id: tempId,
      content: newMessage,
      to: activeChat.id,
    };

    socket.emit('private_message', payload, (response) => {
      if (response && response.error) {
        console.error('send error callback', response.error);
        return;
      }
      if (response && response.message) {
        const serverMsg = response.message;
        setMessages(prev => {
          // if server id already exists, remove temp
          if (prev.find(m => m.id === serverMsg.id)) {
            return prev.filter(m => m.id !== tempId);
          }
          let replaced = false;
          const mapped = prev.map(m => {
            if (m.id === tempId) { replaced = true; return serverMsg; }
            return m;
          });
          if (replaced) return mapped;
          return prev.find(m => m.id === serverMsg.id) ? prev : [...prev, serverMsg];
        });
      }
    });

    setNewMessage('');
  };

  const handleSendFriendRequest = async (email) => {
    try {
      const res = await authFetch('/api/friend-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        console.error('friend-request error', data.error);
        return;
      }
      // re-sync friend requests
      fetchFriendRequests();
      setSearchResults(prev => prev.filter(u => u.email !== email));
    } catch (err) {
      console.error('send friend-request failed', err);
    }
  };

  const handleAcceptFriendRequest = async (requestId) => {
    try {
      const res = await authFetch('/api/friend-request/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId }),
      });
      const data = await res.json();
      if (!res.ok) {
        console.error('accept request error', data.error);
        return;
      }
      // re-sync friends + requests
      await fetchFriends();
      await fetchFriendRequests();
    } catch (err) {
      console.error('accept friend request failed', err);
    }
  };

  const handleRejectFriendRequest = async (requestId) => {
    try {
      const res = await authFetch('/api/friend-request/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId }),
      });
      const data = await res.json();
      if (!res.ok) {
        console.error('reject request error', data.error);
        return;
      }
      fetchFriendRequests();
    } catch (err) {
      console.error('reject friend request failed', err);
    }
  };

  const handleRemoveFriend = async (friendId) => {
    try {
      const res = await authFetch('/api/friends/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ friendId }),
      });
      const data = await res.json();
      if (!res.ok) {
        console.error('remove friend error', data.error);
        return;
      }
      // server should emit friend_removed to the other user.
      // For consistency, refresh our friends list immediately:
      await fetchFriends();
      // if removed friend was active, close chat
      setActiveChat(prev => {
        if (prev && prev.id === friendId) {
          setMessages([]);
          return null;
        }
        return prev;
      });
    } catch (err) {
      console.error('remove friend failed', err);
    }
  };

  // logout
  const handleLogout = async () => {
    try {
      await authFetch('/logout');
    } catch (e) { /* ignore */ }
    try { if (socketRef.current) socketRef.current.disconnect(); } catch (_) {}
    window.location.href = '/login';
  };

  // --- UI rendering helpers ---
  const groupMessagesByDate = (messagesList) => {
    return messagesList.reduce((acc, message) => {
      const date = new Date(message.timestamp).toLocaleDateString();
      if (!acc[date]) acc[date] = [];
      acc[date].push(message);
      return acc;
    }, {});
  };

  const formatTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const unreadFor = (id) => unreadMap[id] || 0;

  if (!currentUser) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0D1117] text-white">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#0D1117] text-[#E6EDF3] font-sans">
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex w-80 flex-col bg-[#071017] border-r border-gray-800">
        <div className="p-4 border-b border-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-lg font-semibold">{currentUser.name}</div>
              <div className="text-xs text-gray-400">{currentUser.email}</div>
            </div>
            <div className="flex flex-col items-end">
              <div className={`w-3 h-3 rounded-full ${socketConnected ? 'bg-green-400' : 'bg-red-500'}`} title={socketConnected ? 'Connected' : 'Disconnected'} />
              <button onClick={handleLogout} className="text-xs mt-2 px-2 py-1 bg-[#0F1720] rounded">Logout</button>
            </div>
          </div>

          <div className="mt-3">
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search users by email..."
              className="w-full p-2 bg-[#061018] border border-[#123] rounded text-sm"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {searchResults.length > 0 && (
            <div className="p-3">
              <div className="text-sm text-[#00FF99] mb-2 font-semibold">Search Results</div>
              <ul>
                {searchResults.map(u => (
                  <li key={u.id} className="flex items-center justify-between p-2 hover:bg-[#07171b] rounded">
                    <div>
                      <div className="font-medium">{u.name}</div>
                      <div className="text-xs text-gray-400">{u.email}</div>
                    </div>
                    <button onClick={() => handleSendFriendRequest(u.email)} className="px-3 py-1 rounded bg-[#0b2] text-black text-sm">Add</button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="p-3 border-t border-gray-800">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-[#00FF99] font-semibold">Friend Requests</div>
            </div>
            {friendRequests.length > 0 ? (
              <ul>
                {friendRequests.map(req => (
                  <li key={req.id} className="flex items-center justify-between p-2 hover:bg-[#07171b] rounded">
                    <div>
                      <div className="font-medium">{req.name}</div>
                      <div className="text-xs text-gray-400">{req.email}</div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleAcceptFriendRequest(req.id)} className="px-2 py-1 rounded bg-green-500 text-black text-sm">Accept</button>
                      <button onClick={() => handleRejectFriendRequest(req.id)} className="px-2 py-1 rounded bg-red-500 text-black text-sm">Reject</button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : <div className="text-xs text-gray-500">No requests</div>}
          </div>

          <div className="p-3 border-t border-gray-800">
            <div className="text-sm text-[#00FF99] font-semibold mb-2">Friends</div>
            {friends.length > 0 ? (
              <ul>
                {friends.map(f => (
                  <li
                    key={f.id}
                    onClick={() => selectFriend(f)}
                    className={`flex items-center justify-between p-2 rounded cursor-pointer hover:bg-[#07171b] ${activeChat?.id === f.id ? 'bg-[#07171b] border-l-4 border-[#00FF99]' : ''}`}
                  >
                    <div className="truncate">
                      <div className="font-medium">{f.name}</div>
                      <div className="text-xs text-gray-400 truncate">{f.email}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {unreadFor(f.id) > 0 && <span className="bg-red-500 text-xs px-2 py-0.5 rounded">{unreadFor(f.id)}</span>}
                      <button onClick={(e) => { e.stopPropagation(); handleRemoveFriend(f.id); }} className="text-xs px-2 py-1 bg-[#220000] rounded">Remove</button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : <div className="text-xs text-gray-500">No friends yet</div>}
          </div>
        </div>
      </aside>

      {/* Mobile Drawer */}
      <div className={`fixed z-40 inset-y-0 left-0 w-64 transform bg-[#071017] border-r border-gray-800 md:hidden transition-transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">{currentUser.name}</div>
              <div className="text-xs text-gray-400">{currentUser.email}</div>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="text-white">Close</button>
          </div>

          <div className="mt-3">
            <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search email..." className="w-full p-2 bg-[#061018] rounded text-sm" />
          </div>
        </div>

        <div className="p-3 overflow-y-auto">
          <div className="text-sm text-[#00FF99] mb-2">Friend Requests</div>
          {friendRequests.map(req => (
            <div key={req.id} className="flex items-center justify-between p-2">
              <div>
                <div className="font-medium">{req.name}</div>
                <div className="text-xs text-gray-400">{req.email}</div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { handleAcceptFriendRequest(req.id); setSidebarOpen(false); }} className="px-2 py-1 bg-green-500 rounded text-black text-xs">Accept</button>
                <button onClick={() => { handleRejectFriendRequest(req.id); setSidebarOpen(false); }} className="px-2 py-1 bg-red-500 rounded text-black text-xs">Reject</button>
              </div>
            </div>
          ))}

          <div className="text-sm text-[#00FF99] my-2">Friends</div>
          {friends.map(f => (
            <div key={f.id} onClick={() => { selectFriend(f); setSidebarOpen(false); }} className="flex items-center justify-between p-2 hover:bg-[#07171b] rounded cursor-pointer">
              <div>
                <div className="font-medium">{f.name}</div>
                <div className="text-xs text-gray-400">{f.email}</div>
              </div>
              <div className="flex items-center gap-2">
                {unreadFor(f.id) > 0 && <span className="bg-red-500 text-xs px-2 py-0.5 rounded">{unreadFor(f.id)}</span>}
                <button onClick={(e) => { e.stopPropagation(); handleRemoveFriend(f.id); setSidebarOpen(false); }} className="px-2 py-1 bg-[#220000] rounded text-xs">Remove</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* overlay for mobile */}
      {sidebarOpen && <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Main chat area */}
      <div className="flex-1 flex flex-col">
        <header className="p-4 border-b border-gray-800 flex items-center justify-between bg-[#041018]">
          <div className="flex items-center gap-3">
            <button className="md:hidden p-2 bg-[#061018] rounded" onClick={() => setSidebarOpen(true)}>☰</button>
            <div>
              <div className="text-lg font-semibold">{activeChat ? activeChat.name : 'Select a friend'}</div>
              <div className="text-xs text-gray-400">{activeChat ? activeChat.email : currentUser.email}</div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-xs text-gray-300">
              <span className={`w-3 h-3 rounded-full ${socketConnected ? 'bg-green-400' : 'bg-red-500'}`} />
              <span>{socketConnected ? 'Connected' : 'Disconnected'}</span>
            </div>
            <button onClick={handleLogout} className="px-3 py-1 bg-[#061018] rounded">Logout</button>
          </div>
        </header>

        {activeChat ? (
          <>
            <main className="flex-1 overflow-y-auto p-4 bg-[#06131a]">
              {loadingMessages ? (
                <div className="flex items-center justify-center h-full text-gray-400">Loading messages...</div>
              ) : (
                <>
                  {Object.entries(groupMessagesByDate(messages)).map(([date, msgs]) => (
                    <div key={date}>
                      <div className="text-center text-xs text-gray-400 my-4">{date}</div>
                      {msgs.map(m => (
                        <div key={m.id} className={`flex mb-4 ${m.sender_id === currentUser.id ? 'justify-end' : 'justify-start'}`}>
                          <div className={`p-3 rounded-xl max-w-md ${m.sender_id === currentUser.id ? 'bg-[#1f8b5a] text-white' : 'bg-[#0e1619] text-[#E6EDF3]'}`}>
                            <div>{m.content}</div>
                            <div className="text-xs text-gray-400 mt-1">{formatTime(m.timestamp)}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </>
              )}
            </main>

            <footer className="p-4 border-t border-gray-800 bg-[#041018]">
              <div className="flex gap-2">
                <input
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder={socketConnected ? 'Type a message...' : 'Disconnected — trying to reconnect...'}
                  className="flex-1 p-3 rounded bg-[#061018] text-white outline-none"
                  disabled={!socketConnected}
                />
                <button onClick={handleSendMessage} disabled={!newMessage.trim() || !socketConnected} className="px-4 py-2 rounded bg-gradient-to-r from-teal-500 to-green-500 text-black disabled:opacity-50">
                  Send
                </button>
              </div>
            </footer>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            Select a friend to start chatting.
          </div>
        )}
      </div>
    </div>
  );
};

export default Chatpage;
