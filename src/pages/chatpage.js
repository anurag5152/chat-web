import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';

// Initialize socket outside of the component to prevent re-creation on re-renders.
const socket = io('http://localhost:5000', { withCredentials: true, autoConnect: false });

const Chatpage = () => {
  // State for managing component data
  const [currentUser, setCurrentUser] = useState(null);
  const [friends, setFriends] = useState([]);
  const [friendRequests, setFriendRequests] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const messagesEndRef = useRef(null);

  const groupMessagesByDate = (messages) => {
    return messages.reduce((acc, message) => {
      const date = new Date(message.timestamp).toLocaleDateString();
      if (!acc[date]) {
        acc[date] = [];
      }
      acc[date].push(message);
      return acc;
    }, {});
  };

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Helper to create authenticated fetch requests
  const authFetch = (url, options = {}) => {
    return fetch(url, {
      ...options,
      credentials: 'include', // This is crucial for sending session cookies
    });
  };

  // Effect for initial data loading and socket connection
  useEffect(() => {
    // 1. Fetch initial data (user, friends, requests)
    const fetchData = async () => {
      try {
        const userRes = await authFetch('/api/session');
        const userData = await userRes.json();
        if (!userData.loggedIn) {
          window.location.href = '/login'; // Redirect if not logged in
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

    // 2. Connect the socket if it's not already connected
    if (!socket.connected) {
      socket.connect();
    }

    socket.on('connect', () => {
      console.log('Socket connected:', socket.id);
    });

    // 3. Listen for incoming private messages
    const handlePrivateMessage = (message) => {
      console.log('Received private message:', message);
      // If the incoming message is for the currently active chat, update the messages state
      setActiveChat(currentActiveChat => {
        if (currentActiveChat && (message.sender_id === currentActiveChat.id || message.receiver_id === currentActiveChat.id)) {
          setMessages(prevMessages => {
            if (prevMessages.find(m => m.id === message.id)) {
              return prevMessages;
            }
            return [...(Array.isArray(prevMessages) ? prevMessages : []), message];
          });
        }
        return currentActiveChat;
      });
    };
    socket.on('private_message', handlePrivateMessage);

    // Listen for new friend requests
    const handleNewFriendRequest = (request) => setFriendRequests(prev => [request, ...(Array.isArray(prev) ? prev : [])]);
    socket.on('new_friend_request', handleNewFriendRequest);

    // Listen for when another user accepts your friend request
    const handleFriendRequestAccepted = (newFriend) => setFriends(prev => [newFriend, ...(Array.isArray(prev) ? prev : [])]);
    socket.on('friend_request_accepted', handleFriendRequestAccepted);

    // 4. Cleanup on component unmount
    return () => {
      console.log('Cleaning up socket listeners...');
      socket.off('private_message', handlePrivateMessage);
      socket.off('new_friend_request', handleNewFriendRequest);
      socket.off('friend_request_accepted', handleFriendRequestAccepted);
    };
  }, []);

  // Effect to scroll to the bottom of the message list when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const searchUsers = async () => {
      if (searchQuery.trim() === '') {
        setSearchResults([]);
        return;
      }
      try {
        const res = await authFetch(`/api/users/search?email=${searchQuery}`);
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

    const debounceTimeout = setTimeout(() => {
      searchUsers();
    }, 300);

    return () => clearTimeout(debounceTimeout);
  }, [searchQuery]);


  // Function to handle selecting a friend to chat with
  const selectFriend = async (friend) => {
    setActiveChat(friend);
    setMessages([]); // Clear previous messages
    try {
      const res = await authFetch(`/api/messages/${friend.id}`);
      const data = await res.json();
      if (res.ok) {
        setMessages(data);
      } else {
        console.error("Failed to fetch messages:", data.error);
      }
    } catch (error) {
      console.error("Error fetching messages:", error);
    }
  };

  const handleSendMessage = () => {
    if (newMessage.trim() && activeChat && socket) {
      const messageData = {
        id: uuidv4(),
        content: newMessage,
        to: activeChat.id,
      };
      console.log('Sending private message:', messageData);

      // Emit the message to the server
      socket.emit('private_message', messageData, (response) => {
        if (response.error) {
          console.error('Message failed to send:', response.error);
        } else {
          console.log('Message sent successfully, response:', response);
          // Optimistically update the UI with the message sent back from the server
          setMessages(prevMessages => [...(Array.isArray(prevMessages) ? prevMessages : []), response.message]);
        }
      });

      setNewMessage('');
    }
  };

  const handleSendFriendRequest = async (email) => {
    try {
      const res = await authFetch('/api/friend-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (res.ok) {
        alert('Friend request sent!');
        setSearchResults(prev => prev.filter(user => user.email !== email));
      } else {
        alert(`Failed to send friend request: ${data.error}`);
      }
    } catch (error) {
      console.error("Error sending friend request:", error);
      alert('Error sending friend request.');
    }
  };

  const handleAcceptFriendRequest = async (requestId) => {
    try {
      const res = await authFetch('/api/friend-request/accept', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ requestId }),
      });
      const data = await res.json();
      if (res.ok) {
        alert('Friend request accepted!');
        setFriendRequests(prev => prev.filter(req => req.id !== requestId));
        // Add the new friend to the friends list
        const newFriend = friendRequests.find(req => req.id === requestId);
        if(newFriend) {
            setFriends(prev => [...(Array.isArray(prev) ? prev : []), {id: newFriend.sender_id, name: newFriend.name, email: newFriend.email}]);
        }
      } else {
        alert(`Failed to accept friend request: ${data.error}`);
      }
    } catch (error) {
      console.error("Error accepting friend request:", error);
      alert('Error accepting friend request.');
    }
  };

  const handleRejectFriendRequest = async (requestId) => {
    try {
      const res = await authFetch('/api/friend-request/reject', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ requestId }),
      });
      const data = await res.json();
      if (res.ok) {
        alert('Friend request rejected!');
        setFriendRequests(prev => prev.filter(req => req.id !== requestId));
      } else {
        alert(`Failed to reject friend request: ${data.error}`);
      }
    } catch (error) {
      console.error("Error rejecting friend request:", error);
      alert('Error rejecting friend request.');
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
                  className={`p-4 flex items-center hover:bg-[#161B22] cursor-pointer border-l-4 ${activeChat?.id === friend.id ? 'border-[#00FF99] bg-[#161B22]' : 'border-transparent'}`}
                >
                  <div className="w-8 h-8 rounded-full bg-teal-500/50 mr-3"></div>
                  {friend.name}
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
                {/* <div className="absolute bottom-0 right-4 w-3 h-3 bg-green-500 rounded-full border-2 border-[#0D1117] animate-pulse"></div> */}
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white">{activeChat.name}</h2>
                <p className="text-sm text-[#8B949E]">{activeChat.email}</p>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 p-4 overflow-y-auto">
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
                  className="p-3 bg-gradient-to-r from-teal-500 to-green-500 text-white rounded-r-lg hover:from-teal-600 hover:to-green-600"
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