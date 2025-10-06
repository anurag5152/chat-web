import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';

// NOTE: make sure this matches your server location
const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 'http://localhost:5000';

// Initialize socket outside component so it persists across re-renders
const socket = io(SOCKET_URL, { withCredentials: true, autoConnect: false });

const Chatpage = () => {
  // State
  const [currentUser, setCurrentUser] = useState(null);
  const [friends, setFriends] = useState([]);
  const [friendRequests, setFriendRequests] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const messagesEndRef = useRef(null);

  const groupMessagesByDate = (messages) => {
    return messages.reduce((acc, message) => {
      const date = new Date(message.timestamp).toLocaleDateString();
      if (!acc[date]) acc[date] = [];
      acc[date].push(message);
      return acc;
    }, {});
  };

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  // authenticated fetch helper
  const authFetch = (url, options = {}) => {
    return fetch(url, {
      ...options,
      credentials: 'include',
    });
  };

  // initial data load
  useEffect(() => {
    const fetchData = async () => {
      try {
        const userRes = await authFetch('/api/session');
        const userData = await userRes.json();
        if (!userData.loggedIn) {
          window.location.href = '/login';
          return;
        }
        setCurrentUser(userData.user);

        const friendsRes = await authFetch('/api/friends');
        const friendsData = await friendsRes.json();
        setFriends(Array.isArray(friendsData) ? friendsData : []);

        const requestsRes = await authFetch('/api/friend-requests');
        const requestsData = await requestsRes.json();
        setFriendRequests(Array.isArray(requestsData) ? requestsData : []);
      } catch (error) {
        console.error("Failed to fetch initial data:", error);
      }
    };

    fetchData();
  }, []);

  // socket connect + core listeners (only when currentUser becomes available)
  useEffect(() => {
    if (!currentUser) return;

    // attach userId in auth for eventual debugging/identify if needed
    socket.auth = { userId: currentUser.id };

    if (!socket.connected) {
      socket.connect();
    }

    const onConnect = () => console.log('Socket connected:', socket.id);
    const onConnectError = (err) => console.error('Socket connection error:', err);

    socket.on('connect', onConnect);
    socket.on('connect_error', onConnectError);

    // New incoming friend request
    const handleNewFriendRequest = (request) => {
      // avoid duplicates
      setFriendRequests(prev => {
        if (prev.find(r => r.id === request.id)) return prev;
        return [request, ...prev];
      });
    };
    socket.on('new_friend_request', handleNewFriendRequest);

    // When someone accepts your friend request
    const handleFriendRequestAccepted = (newFriend) => {
      setFriends(prev => {
        if (prev.find(f => f.id === newFriend.id)) return prev;
        return [newFriend, ...prev];
      });
    };
    socket.on('friend_request_accepted', handleFriendRequestAccepted);

    // When someone removes you as a friend
    const handleFriendRemoved = ({ friendId }) => {
      setFriends(prev => prev.filter(friend => friend.id !== friendId));
      setActiveChat(currentActiveChat => {
        if (currentActiveChat && currentActiveChat.id === friendId) {
          setMessages([]);
          return null;
        }
        return currentActiveChat;
      });
    };
    socket.on('friend_removed', handleFriendRemoved);

    // cleanup
    return () => {
      socket.off('connect', onConnect);
      socket.off('connect_error', onConnectError);
      socket.off('new_friend_request', handleNewFriendRequest);
      socket.off('friend_request_accepted', handleFriendRequestAccepted);
      socket.off('friend_removed', handleFriendRemoved);
    };
  }, [currentUser]);

  // incoming private messages handler
  useEffect(() => {
    const handlePrivateMessage = (message) => {
      // If the message belongs to the currently active chat, append it
      if (activeChat && (message.sender_id === activeChat.id || message.receiver_id === activeChat.id)) {
        setMessages(prevMessages => {
          // avoid duplicates by id
          if (prevMessages.find(m => m.id === message.id)) return prevMessages;
          return [...prevMessages, message];
        });
      } else {
        // If not active chat, you could show unread counts here; for now we just log
        console.log('Private message received for other chat', message);
      }
    };

    socket.on('private_message', handlePrivateMessage);
    return () => socket.off('private_message', handlePrivateMessage);
  }, [activeChat]);

  // auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // user search debounce
  useEffect(() => {
    const searchUsers = async () => {
      if (searchQuery.trim() === '') {
        setSearchResults([]);
        return;
      }
      try {
        const res = await authFetch(`/api/users/search?email=${encodeURIComponent(searchQuery)}`);
        const data = await res.json();
        if (res.ok) {
          setSearchResults(data);
        } else {
          console.error("Failed to search users:", data.error);
        }
      } catch (error) {
        console.error("Error searching users:", error);
      }
    };

    const debounceTimeout = setTimeout(searchUsers, 300);
    return () => clearTimeout(debounceTimeout);
  }, [searchQuery]);

  // select friend & load messages
  const selectFriend = async (friend) => {
    setActiveChat(friend);
    setMessages([]); // Clear previous messages while loading
    setLoadingMessages(true);
    try {
      const res = await authFetch(`/api/messages/${friend.id}`);
      const data = await res.json();
      if (res.ok) {
        setMessages(Array.isArray(data) ? data : []);
      } else {
        console.error("Failed to fetch messages:", data.error);
      }
    } catch (error) {
      console.error("Error fetching messages:", error);
    } finally {
      setLoadingMessages(false);
    }
  };

  // Robust send: optimistic UI + server replace (dedupe)
  const handleSendMessage = () => {
    if (!newMessage.trim() || !activeChat || !currentUser) return;

    // client temporary message id
    const tempId = uuidv4();
    const optimisticMessage = {
      id: tempId,
      sender_id: currentUser.id,
      receiver_id: activeChat.id,
      content: newMessage,
      timestamp: new Date().toISOString(),
    };

    // Append immediately (optimistic)
    setMessages(prev => [...prev, optimisticMessage]);

    const messageData = {
      id: tempId, // provide temp id so we can replace it after server ack
      content: newMessage,
      to: activeChat.id,
    };

    // send to server with callback
    socket.emit('private_message', messageData, (response) => {
      if (response && response.error) {
        console.error('Message failed to send:', response.error);
        // Optionally mark the message as failed (not implemented visually here)
        return;
      }
      if (response && response.message) {
        const serverMsg = response.message;
        // replace optimistic temp message with server message (by tempId)
        setMessages(prev => {
          // if server already in list by id, ignore
          if (prev.find(m => m.id === serverMsg.id)) return prev;
          // replace the temp message with server message
          return prev.map(m => (m.id === tempId ? serverMsg : m));
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
      if (res.ok) {
        console.log('Friend request sent!');
        setSearchResults(prev => prev.filter(user => user.email !== email));
      } else {
        console.error(`Failed to send friend request: ${data.error}`);
      }
    } catch (error) {
      console.error("Error sending friend request:", error);
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
      if (res.ok) {
        console.log('Friend request accepted!');
        const acceptedRequest = friendRequests.find(req => req.id === requestId);
        if (acceptedRequest) {
          const newFriend = {
            id: acceptedRequest.sender_id,
            name: acceptedRequest.name,
            email: acceptedRequest.email,
          };
          setFriends(prev => {
            if (prev.find(f => f.id === newFriend.id)) return prev;
            return [newFriend, ...prev];
          });
        }
        setFriendRequests(prev => prev.filter(req => req.id !== requestId));
      } else {
        console.error(`Failed to accept friend request: ${data.error}`);
      }
    } catch (error) {
      console.error("Error accepting friend request:", error);
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
      if (res.ok) {
        console.log('Friend removed!');
        setFriends(prev => prev.filter(friend => friend.id !== friendId));
        if (activeChat?.id === friendId) {
          setActiveChat(null);
          setMessages([]);
        }
      } else {
        console.error(`Failed to remove friend: ${data.error}`);
      }
    } catch (error) {
      console.error("Error removing friend:", error);
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
      if (res.ok) {
        console.log('Friend request rejected!');
        setFriendRequests(prev => prev.filter(req => req.id !== requestId));
      } else {
        console.error(`Failed to reject friend request: ${data.error}`);
      }
    } catch (error) {
      console.error("Error rejecting friend request:", error);
    }
  };

  if (!currentUser) {
    return (
      <div className="flex h-screen bg-gray-100 items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#0D1117] text-[#E6EDF3] font-mono">
      {/* Sidebar */}
      <div className="w-full md:w-1/4 bg-[#0D1117] border-r border-gray-800 flex flex-col shadow-inner">
        <div className="p-4 border-b border-gray-800">
          <input
            type="text"
            placeholder="Search by email"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full p-2 bg-[#161B22] border border-[#00FF99] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00FF99] text-[#E6EDF3]"
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {searchResults.length > 0 && (
            <div>
              <h2 className="p-4 text-lg font-semibold text-[#00FF99]">Search Results</h2>
              <ul>
                {searchResults.map(user => (
                  <li key={user.id} className="flex items-center justify-between p-4 hover:bg-[#161B22] cursor-pointer">
                    <div className="flex items-center">
                      <div className="w-8 h-8 rounded-full bg-teal-500/50 mr-3"></div>
                      <div>
                        <span className="font-bold">{user.name}</span>
                        <span className="text-xs text-gray-400 block">{user.email}</span>
                      </div>
                    </div>
                    <button onClick={() => handleSendFriendRequest(user.email)} className="p-2 text-[#00FF99] hover:bg-[#00FF99] hover:text-black rounded">Add</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <h2 className="p-4 text-lg font-semibold text-[#00FF99]">Friend Requests</h2>
          {friendRequests.length > 0 ? (
            <ul>
              {friendRequests.map(req => (
                <li key={req.id} className="flex items-center justify-between p-4 hover:bg-[#161B22]">
                  <div className="flex items-center">
                    <div className="w-8 h-8 rounded-full bg-teal-500/50 mr-3"></div>
                    <div>
                      <span className="font-bold">{req.name}</span>
                      <span className="text-xs text-gray-400 block">{req.email}</span>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <button onClick={() => handleAcceptFriendRequest(req.id)} className="p-2 text-green-500 hover:bg-green-500 hover:text-black rounded">Accept</button>
                    <button onClick={() => handleRejectFriendRequest(req.id)} className="p-2 text-red-500 hover:bg-red-500 hover:text-black rounded">Reject</button>
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="px-4 text-gray-500">No new requests.</p>}

          <h2 className="p-4 text-lg font-semibold text-[#00FF99]">Friends</h2>
          {friends.length > 0 ? (
            <ul>
              {friends.map(friend => (
                <li
                  key={friend.id}
                  onClick={() => selectFriend(friend)}
                  className={`p-4 flex items-center justify-between hover:bg-[#161B22] cursor-pointer border-l-4 ${activeChat?.id === friend.id ? 'border-[#00FF99] bg-[#161B22]' : 'border-transparent'}`}
                >
                  <div className="flex items-center">
                    <div className="w-8 h-8 rounded-full bg-teal-500/50 mr-3"></div>
                    {friend.name}
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); handleRemoveFriend(friend.id); }} className="p-2 text-red-500 hover:bg-red-500 hover:text-black rounded">Remove</button>
                </li>
              ))}
            </ul>
          ) : <p className="px-4 text-gray-500">Add some friends to start chatting.</p>}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-[#0D1117]">
        {activeChat ? (
          <>
            {/* Chat Header */}
            <div className="p-4 bg-[#0D1117]/50 border-b border-gray-800 flex items-center shadow-lg">
              <div className="relative">
                <div className="w-10 h-10 rounded-full bg-teal-500/50 mr-4"></div>
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white">{activeChat.name}</h2>
                <p className="text-sm text-[#8B949E]">{activeChat.email}</p>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 p-4 overflow-y-auto">
              {loadingMessages ? (
                <div className="flex h-full items-center justify-center">
                  <p>Loading messages...</p>
                </div>
              ) : (
                <>
                  {Object.entries(groupMessagesByDate(messages)).map(([date, messagesForDate]) => (
                    <React.Fragment key={date}>
                      <div className="text-center my-4">
                        <span className="text-xs text-gray-500 bg-gray-800 px-2 py-1 rounded-full">{date}</span>
                      </div>
                      {messagesForDate.map((message) => (
                        <div
                          key={message.id}
                          className={`flex ${message.sender_id === currentUser.id ? 'justify-end' : 'justify-start'} mb-4`}
                        >
                          <div
                            className={`p-3 rounded-xl max-w-md shadow-lg ${
                              message.sender_id === currentUser.id
                                ? 'bg-[#238636] text-white border border-[#00FF99]/50'
                                : 'bg-[#161B22] text-[#E6EDF3] shadow-inner'
                            }`}
                          >
                            <div>{message.content}</div>
                            <div className="text-xs text-gray-400 mt-1">{formatTime(message.timestamp)}</div>
                          </div>
                        </div>
                      ))}
                    </React.Fragment>
                  ))}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {/* Message Input */}
            <div className="p-4 bg-[#0D1117]/50 border-t border-gray-800">
              <div className="flex items-center bg-[#161B22] rounded-lg border border-transparent focus-within:border-[#00FF99]">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder="Type a message..."
                  className="flex-1 p-3 bg-transparent rounded-l-lg focus:outline-none text-[#E6EDF3]"
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!newMessage.trim()}
                  className="p-3 bg-gradient-to-r from-teal-500 to-green-500 text-white rounded-r-lg hover:from-teal-600 hover:to-green-600 disabled:opacity-50"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-[#8B949E] text-xl">
            <p>Select a friend to start chatting.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Chatpage;
