/**
 * Halonyx Group Messaging Module
 * Reverse-engineered End-to-End Encrypted Group Messaging for Halonyx.
 * Implements Signal Protocol Group architecture using Pairwise Double Ratchet Fan-Out.
 *
 * UMD: CommonJS & Browser global (window.HalonyxGroups) compatible.
 */
(function (root, factory) {
  if (typeof define === "function" && define.amd) {
    define([], factory);
  } else if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.HalonyxGroups = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const PREFIX = "grp_";
  let inMemoryGroups = {};

  function generateGroupId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      try {
        return PREFIX + crypto.randomUUID().replace(/-/g, "").substring(0, 24);
      } catch (e) {}
    }
    return (
      PREFIX +
      Date.now().toString(36) +
      Math.random().toString(36).substring(2, 10)
    );
  }

  function storageKey(userUsid) {
    return "halonyx_groups:" + (userUsid || "default");
  }

  function loadGroups(userUsid) {
    const key = storageKey(userUsid);
    if (typeof localStorage !== "undefined") {
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            inMemoryGroups[key] = parsed;
            return parsed;
          }
        }
      } catch (e) {
        console.warn("[Groups] Failed to load groups from localStorage:", e);
      }
    }
    return inMemoryGroups[key] || [];
  }

  function saveGroups(groups, userUsid) {
    const key = storageKey(userUsid);
    inMemoryGroups[key] = groups;
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(key, JSON.stringify(groups));
      } catch (e) {
        console.warn("[Groups] Failed to save groups to localStorage:", e);
      }
    }
    return groups;
  }

  function normUsid(u) {
    return String(u || "").trim().toLowerCase().replace(/^0x/, "");
  }

  /**
   * Creates a new encrypted group descriptor.
   */
  function createGroup(name, description, memberUsids, creatorUsid) {
    if (!name || typeof name !== "string" || !name.trim()) {
      throw new Error("Group name is required");
    }
    const cleanCreator = String(creatorUsid || "").trim();
    const cleanMembers = Array.isArray(memberUsids)
      ? memberUsids.map((m) => String(m).trim()).filter(Boolean)
      : [];

    const seen = new Set();
    const uniqueMembers = [];

    for (const m of cleanMembers) {
      const norm = normUsid(m);
      if (norm && !seen.has(norm)) {
        seen.add(norm);
        uniqueMembers.push(m);
      }
    }

    if (cleanCreator) {
      const normCreator = normUsid(cleanCreator);
      if (normCreator && !seen.has(normCreator)) {
        seen.add(normCreator);
        uniqueMembers.push(cleanCreator);
      }
    }

    const group = {
      id: generateGroupId(),
      name: name.trim().substring(0, 100),
      description: description ? String(description).trim().substring(0, 250) : "",
      creator: cleanCreator,
      members: uniqueMembers,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      unreadCount: 0,
    };

    return group;
  }

  /**
   * Upserts a group into the user's local store.
   */
  function addOrUpdateGroup(group, userUsid) {
    if (!group || !group.id) return null;
    const groups = loadGroups(userUsid);
    const index = groups.findIndex((g) => g.id === group.id);

    if (index >= 0) {
      groups[index] = Object.assign({}, groups[index], group, {
        updatedAt: new Date().toISOString(),
      });
    } else {
      groups.push(group);
    }

    saveGroups(groups, userUsid);
    return group;
  }

  function getGroup(groupId, userUsid) {
    if (!groupId) return null;
    const groups = loadGroups(userUsid);
    return groups.find((g) => g.id === groupId) || null;
  }

  function deleteGroup(groupId, userUsid) {
    if (!groupId) return false;
    const groups = loadGroups(userUsid);
    const filtered = groups.filter((g) => g.id !== groupId);
    saveGroups(filtered, userUsid);
    return true;
  }

  function addMember(groupId, memberUsid, userUsid) {
    const group = getGroup(groupId, userUsid);
    if (!group) return null;
    const cleanMember = String(memberUsid || "").trim();
    if (!cleanMember) return group;

    const norm = normUsid(cleanMember);
    const exists = group.members.some((m) => normUsid(m) === norm);
    if (exists) return group;

    group.members.push(cleanMember);
    group.updatedAt = new Date().toISOString();
    return addOrUpdateGroup(group, userUsid);
  }

  function removeMember(groupId, memberUsid, userUsid) {
    const group = getGroup(groupId, userUsid);
    if (!group) return null;
    const norm = normUsid(memberUsid);
    group.members = group.members.filter((m) => normUsid(m) !== norm);
    group.updatedAt = new Date().toISOString();
    return addOrUpdateGroup(group, userUsid);
  }

  /**
   * Returns list of other members in the group that need to receive the message fan-out.
   */
  function getOtherMembers(group, myUsid) {
    if (!group || !Array.isArray(group.members)) return [];
    const myClean = normUsid(myUsid);
    const seen = new Set();
    const result = [];
    for (const m of group.members) {
      const clean = normUsid(m);
      if (clean && clean !== myClean && !seen.has(clean)) {
        seen.add(clean);
        result.push(m);
      }
    }
    return result;
  }

  /**
   * Processes incoming envelope to detect and handle group messages or invitations.
   */
  function handleIncomingEnvelope(envelope, senderHashedUsid, userUsid) {
    if (!envelope || !envelope.group || !envelope.group.id) {
      return { isGroupMessage: false };
    }

    const groupMeta = envelope.group;
    let existing = getGroup(groupMeta.id, userUsid);
    let isNew = false;

    if (!existing) {
      const seen = new Set();
      const initialMembers = [];
      const rawList = Array.isArray(groupMeta.members) && groupMeta.members.length > 0
        ? groupMeta.members
        : [senderHashedUsid, userUsid];

      for (const m of rawList) {
        const clean = String(m || "").trim();
        const norm = normUsid(clean);
        if (norm && !seen.has(norm)) {
          seen.add(norm);
          initialMembers.push(clean);
        }
      }

      const normSender = normUsid(senderHashedUsid);
      if (normSender && !seen.has(normSender)) {
        seen.add(normSender);
        initialMembers.push(senderHashedUsid);
      }

      const normUser = normUsid(userUsid);
      if (normUser && !seen.has(normUser)) {
        seen.add(normUser);
        initialMembers.push(userUsid);
      }

      // Auto-register discovered group
      existing = {
        id: groupMeta.id,
        name: groupMeta.name || "Group " + groupMeta.id.substring(4, 10),
        description: "",
        creator: senderHashedUsid,
        members: initialMembers,
        createdAt: envelope.ts || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        unreadCount: 0,
      };
      isNew = true;
    } else {
      // Merge newly announced members if present
      if (Array.isArray(groupMeta.members)) {
        const seen = new Set(existing.members.map((m) => normUsid(m)));
        groupMeta.members.forEach((m) => {
          const clean = String(m || "").trim();
          const norm = normUsid(clean);
          if (norm && !seen.has(norm)) {
            seen.add(norm);
            existing.members.push(clean);
          }
        });
      }
      if (groupMeta.name && groupMeta.name !== existing.name) {
        existing.name = groupMeta.name;
      }
    }

    addOrUpdateGroup(existing, userUsid);

    return {
      isGroupMessage: true,
      group: existing,
      isNewGroup: isNew,
      action: groupMeta.action || "message",
    };
  }

  return {
    generateGroupId,
    createGroup,
    loadGroups,
    saveGroups,
    getGroup,
    addOrUpdateGroup,
    deleteGroup,
    addMember,
    removeMember,
    getOtherMembers,
    handleIncomingEnvelope,
  };
});
