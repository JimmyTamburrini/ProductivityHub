(function () {
  /*
    PRODUCTIVITY HUB - EDITING GUIDE

    This file powers the entire website.

    High-level structure:
    1. Constants and localStorage keys
    2. Data loading/saving helpers
    3. Formatting helpers
    4. Calculation helpers
    5. Page rendering functions
    6. Shared app state
    7. Event handlers
    8. Initial app startup

    Most important places to edit:
    - Navigation tabs: renderNavigation()
    - Home page: renderHomePage()
    - Classes page: renderClassesPage(), renderClassesOverview(), renderClassDetail()
    - Sessions page: renderSessionsPage(), renderSessionForm(), renderSessionList()
    - Charts page: renderWeeklyChart(), renderAnalyticsPage()
    - Stats page: renderStatsPage()
    - Calendar page: renderCalendarPage()
    - Saved data shape: normalizeSession(), loadGrades(), loadClassGradebooks()
    - Messages after saving: getEncouragementMessage(), showFlashMessage()

    Important note:
    This app uses "render everything again" style rendering.
    That means when state changes, render() rebuilds the HTML inside #app.
  */

  // localStorage keys used to save study sessions, exam-grade comparisons, and class gradebooks.
  const STORAGE_KEY = "study-tracker-sessions";
  const GRADE_STORAGE_KEY = "study-tracker-grades";
  const CLASS_GRADES_STORAGE_KEY = "study-tracker-class-gradebooks";
  const CLASS_CATALOG_STORAGE_KEY = "study-tracker-class-catalog";
  const AUTH_ACCOUNTS_KEY = "scholarhq-auth-accounts";
  const AUTH_SESSION_KEY = "scholarhq-auth-session";
  const PAGE_DEFINITIONS = [
    { key: "home", label: "Home" },
    { key: "classes", label: "Classes" },
    { key: "sessions", label: "Sessions" },
    { key: "analytics", label: "Charts" },
    { key: "stats", label: "Stats" },
    { key: "calendar", label: "Calendar", action: "open-calendar" },
    { key: "security", label: "Security" },
  ];
  const VALID_PAGE_KEYS = new Set(PAGE_DEFINITIONS.map(function (page) { return page.key; }));

  // Main HTML mount point where the whole app is drawn.
  const appRoot = document.querySelector("#app");

  function safeParseJson(raw, fallback) {
    try {
      return raw ? JSON.parse(raw) : fallback;
    } catch (_error) {
      return fallback;
    }
  }

  function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
  }

  function loadAccounts() {
    const parsed = safeParseJson(window.localStorage.getItem(AUTH_ACCOUNTS_KEY), []);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map(function (account) {
        return {
          id: String(account.id || ""),
          name: String(account.name || "Student").trim() || "Student",
          email: normalizeEmail(account.email),
          passwordHash: String(account.passwordHash || ""),
          salt: String(account.salt || ""),
          createdAt: String(account.createdAt || ""),
          lastLoginAt: String(account.lastLoginAt || ""),
          school: String(account.school || "").trim(),
        };
      })
      .filter(function (account) {
        return account.id && account.email && account.passwordHash && account.salt;
      });
  }

  function saveAccounts(accounts) {
    window.localStorage.setItem(AUTH_ACCOUNTS_KEY, JSON.stringify(accounts));
  }

  function loadSavedUser() {
    const session = safeParseJson(window.localStorage.getItem(AUTH_SESSION_KEY), null);
    if (!session || !session.userId) {
      return null;
    }

    return loadAccounts().find(function (account) {
      return account.id === session.userId;
    }) || null;
  }

  const DEMO_USER = {
    id: "demo-ui-preview",
    name: "Student",
    email: "preview@academictilt.local",
    passwordHash: "",
    salt: "",
    createdAt: "",
    lastLoginAt: "",
    school: "",
  };

  let activeUser = loadSavedUser() || DEMO_USER;

  function getScopedStorageKey(baseKey, userId) {
    const ownerId = userId || (activeUser && activeUser.id);
    return ownerId ? baseKey + ":" + ownerId : baseKey;
  }

  function isValidDateString(value) {
    return typeof value === "string" && !Number.isNaN(Date.parse(value));
  }

  function generateId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }

    return `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function generateSalt() {
    const values = new Uint8Array(16);
    if (window.crypto && typeof window.crypto.getRandomValues === "function") {
      window.crypto.getRandomValues(values);
      return Array.from(values)
        .map(function (value) {
          return value.toString(16).padStart(2, "0");
        })
        .join("");
    }

    return `salt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  async function hashPassword(password, salt) {
    const input = `${salt}:${password}`;

    if (window.crypto && window.crypto.subtle && window.TextEncoder) {
      const encoded = new TextEncoder().encode(input);
      const digest = await window.crypto.subtle.digest("SHA-256", encoded);
      return Array.from(new Uint8Array(digest))
        .map(function (value) {
          return value.toString(16).padStart(2, "0");
        })
        .join("");
    }

    // Fallback for older browsers. This is only for local demo accounts and is not backend-grade security.
    var hash = 0;
    for (var index = 0; index < input.length; index += 1) {
      hash = (hash << 5) - hash + input.charCodeAt(index);
      hash |= 0;
    }
    return String(hash);
  }



  async function callAuthApi(path, payload) {
    if (window.location.protocol === "file:") {
      return null;
    }

    const response = await window.fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(payload || {}),
    });
    const result = await response.json().catch(function () { return {}; });
    if (!response.ok) {
      throw new Error(result.error || "Authentication failed. Please try again.");
    }
    return result;
  }

  async function syncAccountFile(account) {
    if (!account || !account.id || window.location.protocol === "file:") {
      return;
    }

    try {
      await window.fetch("/api/accounts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: account.id,
          name: account.name,
          email: account.email,
          school: account.school,
          createdAt: account.createdAt,
          lastLoginAt: account.lastLoginAt,
        }),
      });
    } catch (_error) {
      // The local browser account still works if the optional server-side account list is unavailable.
    }
  }

  function setActiveUser(account) {
    activeUser = account;
    if (account) {
      window.localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({ userId: account.id, savedAt: new Date().toISOString() }));
    } else {
      window.localStorage.removeItem(AUTH_SESSION_KEY);
    }
  }

  function validateAuthFields(input, mode) {
    const errors = {};
    if (mode === "signup" && !String(input.name || "").trim()) {
      errors.name = "Add your name so your dashboard can greet you.";
    }

    if (mode === "signup" && !String(input.school || "").trim()) {
      errors.school = "Add your school so AcademicTILT can tailor study research to your classes.";
    }

    if (!normalizeEmail(input.email) || !normalizeEmail(input.email).includes("@")) {
      errors.email = "Enter a valid email address.";
    }

    if (!String(input.password || "").trim()) {
      errors.password = "Enter your password.";
    } else if (mode === "signup" && String(input.password).length < 8) {
      errors.password = "Use at least 8 characters.";
    }

    return errors;
  }

  function copyLegacyStorageToAccount(userId) {
    [STORAGE_KEY, GRADE_STORAGE_KEY, CLASS_GRADES_STORAGE_KEY, CLASS_CATALOG_STORAGE_KEY].forEach(function (baseKey) {
      const scopedKey = getScopedStorageKey(baseKey, userId);
      if (window.localStorage.getItem(scopedKey)) {
        return;
      }

      const legacyValue = window.localStorage.getItem(baseKey);
      if (legacyValue) {
        window.localStorage.setItem(scopedKey, legacyValue);
      }
    });
  }

  function reloadAccountData() {
    state.sessions = loadSessions();
    state.grades = loadGrades();
    state.classGradebooks = loadClassGradebooks();
    state.classCatalog = loadClassCatalog();
    state.draft = blankDraft();
    state.errors = {};
    state.editingId = null;
    state.selectedClass = null;
    state.currentPage = "home";
  }

  function normalizeSession(session) {
    const now = new Date().toISOString();

    return {
      id: String(session.id || generateId()),
      subject: String(session.subject || "").trim(),
      assignment: String(session.assignment || "").trim(),
      assignmentType: String(session.assignmentType || "").trim().toLowerCase(),
      assignmentGradePercent:
        session.assignmentGradePercent === "" || session.assignmentGradePercent === null || session.assignmentGradePercent === undefined
          ? ""
          : Number(session.assignmentGradePercent),
      assignmentWeightPercent:
        session.assignmentWeightPercent === "" || session.assignmentWeightPercent === null || session.assignmentWeightPercent === undefined
          ? ""
          : Number(session.assignmentWeightPercent),
      linkedClassGradeId: String(session.linkedClassGradeId || ""),
      date: isValidDateString(session.date) ? session.date : now.slice(0, 10),
      durationMinutes: Number(session.durationMinutes || 0),
      notes: String(session.notes || "").trim(),
      category: String(session.category || "").trim(),
      createdAt: isValidDateString(session.createdAt) ? session.createdAt : now,
      updatedAt: isValidDateString(session.updatedAt) ? session.updatedAt : now,
    };
  }

  // SESSION STORAGE
  // These functions are responsible for reading/writing study-session data.
  function loadSessions() {
    try {
      const raw = window.localStorage.getItem(getScopedStorageKey(STORAGE_KEY));
      if (!raw) {
        return [];
      }

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .map(normalizeSession)
        .filter((session) => session.subject && session.durationMinutes > 0)
        .sort((a, b) => new Date(b.date) - new Date(a.date));
    } catch (_error) {
      return [];
    }
  }

  function saveSessions(sessions) {
    const normalized = sessions.map(normalizeSession);
    window.localStorage.setItem(getScopedStorageKey(STORAGE_KEY), JSON.stringify(normalized));
  }

  // EXAM GRADE STORAGE
  // These functions save the grade-vs-study comparison section on the Stats page.
  function loadGrades() {
    try {
      const raw = window.localStorage.getItem(getScopedStorageKey(GRADE_STORAGE_KEY));
      if (!raw) {
        return [];
      }

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .map(function (entry) {
          return {
            id: String(entry.id || generateId()),
            subject: String(entry.subject || "").trim(),
            examName: String(entry.examName || "").trim(),
            examDate: isValidDateString(entry.examDate) ? entry.examDate : new Date().toISOString().slice(0, 10),
            gradePercent: Number(entry.gradePercent || 0),
            notes: String(entry.notes || "").trim(),
          };
        })
        .filter(function (entry) {
          return entry.subject && entry.examName;
        })
        .sort(function (a, b) {
          return new Date(b.examDate) - new Date(a.examDate);
        });
    } catch (_error) {
      return [];
    }
  }

  function saveGrades(grades) {
    window.localStorage.setItem(getScopedStorageKey(GRADE_STORAGE_KEY), JSON.stringify(grades));
  }

  // CLASS GRADEBOOK STORAGE
  // These functions save weighted assignment tables for each class.
  function loadClassGradebooks() {
    try {
      const raw = window.localStorage.getItem(getScopedStorageKey(CLASS_GRADES_STORAGE_KEY));
      if (!raw) {
        return {};
      }

      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return {};
      }

      const normalized = {};
      Object.keys(parsed).forEach(function (key) {
        const entries = Array.isArray(parsed[key]) ? parsed[key] : [];
        const subjectKey = String(key || "").trim();
        if (!subjectKey) {
          return;
        }

        normalized[subjectKey] = entries
          .map(function (entry) {
            const gradePercent = Number(entry.gradePercent);
            const weightPercent = Number(entry.weightPercent);
            return {
              id: String(entry.id || generateId()),
              name: String(entry.name || "").trim(),
              itemType: String(entry.itemType || "assignment").trim().toLowerCase(),
              date: isValidDateString(entry.date) ? entry.date : new Date().toISOString().slice(0, 10),
              gradePercent: Number.isFinite(gradePercent) ? gradePercent : 0,
              weightPercent: Number.isFinite(weightPercent) ? weightPercent : 0,
            };
          })
          .filter(function (entry) {
            return entry.name;
          });
      });

      return normalized;
    } catch (_error) {
      return {};
    }
  }

  function saveClassGradebooks(gradebooks) {
    window.localStorage.setItem(getScopedStorageKey(CLASS_GRADES_STORAGE_KEY), JSON.stringify(gradebooks));
  }


  // CLASS CATALOG STORAGE
  // These functions save the student's explicit class roster with course codes.
  function normalizeClassCatalogEntry(entry) {
    return {
      id: String(entry.id || generateId()),
      name: String(entry.name || entry.subject || "").trim(),
      code: String(entry.code || "").trim().toUpperCase(),
      createdAt: isValidDateString(entry.createdAt) ? entry.createdAt : new Date().toISOString(),
    };
  }

  function loadClassCatalog() {
    try {
      const raw = window.localStorage.getItem(getScopedStorageKey(CLASS_CATALOG_STORAGE_KEY));
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .map(normalizeClassCatalogEntry)
        .filter(function (entry) {
          return entry.name;
        })
        .sort(function (a, b) {
          return a.name.localeCompare(b.name);
        });
    } catch (_error) {
      return [];
    }
  }

  function saveClassCatalog(classes) {
    const normalized = classes
      .map(normalizeClassCatalogEntry)
      .filter(function (entry) {
        return entry.name;
      })
      .sort(function (a, b) {
        return a.name.localeCompare(b.name);
      });
    window.localStorage.setItem(getScopedStorageKey(CLASS_CATALOG_STORAGE_KEY), JSON.stringify(normalized));
  }

  function createSession(input) {
    const now = new Date().toISOString();
    return normalizeSession({
      id: generateId(),
      subject: input.subject,
      assignment: input.assignment,
      assignmentType: input.assignmentType,
      assignmentGradePercent: input.assignmentGradePercent,
      assignmentWeightPercent: input.assignmentWeightPercent,
      linkedClassGradeId: input.linkedClassGradeId,
      date: input.date,
      durationMinutes: input.durationMinutes,
      notes: input.notes,
      category: input.category,
      createdAt: now,
      updatedAt: now,
    });
  }

  function updateSession(existing, input) {
    return normalizeSession({
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
      subject: input.subject,
      assignment: input.assignment,
      assignmentType: input.assignmentType,
      assignmentGradePercent: input.assignmentGradePercent,
      assignmentWeightPercent: input.assignmentWeightPercent,
      linkedClassGradeId: input.linkedClassGradeId,
      date: input.date,
      durationMinutes: input.durationMinutes,
      notes: input.notes,
      category: input.category,
    });
  }

  // DISPLAY / FORMATTING HELPERS
  // These turn raw numbers and dates into readable text for the UI.
  function formatMinutes(totalMinutes) {
    const minutes = Math.max(0, Number(totalMinutes) || 0);
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    if (hours === 0) {
      return `${remainingMinutes} min`;
    }

    if (remainingMinutes === 0) {
      return `${hours} hr`;
    }

    return `${hours} hr ${remainingMinutes} min`;
  }

  function formatDate(value) {
    const date = new Date(value);
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(date);
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function formatClock(totalSeconds) {
    const seconds = Math.max(0, Number(totalSeconds) || 0);
    const hours = String(Math.floor(seconds / 3600)).padStart(2, "0");
    const minutes = String(Math.floor((seconds % 3600) / 60)).padStart(2, "0");
    const remainingSeconds = String(seconds % 60).padStart(2, "0");
    return `${hours}:${minutes}:${remainingSeconds}`;
  }

  // GPA + STATS HELPERS
  // If you want a different GPA conversion scale later, edit percentageToGpa().
  function percentageToGpa(percentage) {
    if (percentage >= 93) return 4.0;
    if (percentage >= 90) return 3.7;
    if (percentage >= 87) return 3.3;
    if (percentage >= 83) return 3.0;
    if (percentage >= 80) return 2.7;
    if (percentage >= 77) return 2.3;
    if (percentage >= 73) return 2.0;
    if (percentage >= 70) return 1.7;
    if (percentage >= 67) return 1.3;
    if (percentage >= 65) return 1.0;
    return 0.0;
  }

  function formatGpa(value) {
    return Number(value || 0).toFixed(2);
  }

  function getUniqueSubjects(sessions, grades, classGradebooks, classCatalog) {
    const subjects = new Set();
    (classCatalog || []).forEach(function (entry) {
      if (entry && entry.name) {
        subjects.add(entry.name);
      }
    });
    sessions.forEach(function (session) {
      if (session.subject) {
        subjects.add(session.subject);
      }
    });
    grades.forEach(function (grade) {
      if (grade.subject) {
        subjects.add(grade.subject);
      }
    });
    Object.keys(classGradebooks || {}).forEach(function (subject) {
      if (subject) {
        subjects.add(String(subject).trim());
      }
    });
    return Array.from(subjects).sort();
  }


  function findClassCatalogEntry(subject) {
    const normalized = String(subject || "").trim().toLowerCase();
    return (state.classCatalog || []).find(function (entry) {
      return String(entry.name || "").trim().toLowerCase() === normalized;
    }) || null;
  }

  function formatClassLabel(subject) {
    const entry = findClassCatalogEntry(subject);
    if (!entry || !entry.code) {
      return subject;
    }
    return `${subject} (${entry.code})`;
  }

  function calculateClassMetrics(entries) {
    const weightedEntries = (entries || []).filter(function (entry) {
      return (
        entry &&
        Number.isFinite(Number(entry.gradePercent)) &&
        Number.isFinite(Number(entry.weightPercent)) &&
        Number(entry.weightPercent) > 0
      );
    });

    if (!weightedEntries.length) {
      return { weightedAverage: 0, gpa: 0, totalWeight: 0 };
    }

    const totals = weightedEntries.reduce(
      function (sum, entry) {
        const gradePercent = Number(entry.gradePercent);
        const weightPercent = Number(entry.weightPercent);
        return {
          weightedPoints: sum.weightedPoints + gradePercent * weightPercent,
          totalWeight: sum.totalWeight + weightPercent,
        };
      },
      { weightedPoints: 0, totalWeight: 0 }
    );

    const weightedAverage = totals.totalWeight > 0 ? totals.weightedPoints / totals.totalWeight : 0;

    return {
      weightedAverage: weightedAverage,
      gpa: percentageToGpa(weightedAverage),
      totalWeight: totals.totalWeight,
    };
  }

  function removeLinkedClassGrade(gradebooks, linkedId) {
    if (!linkedId) {
      return gradebooks;
    }

    const next = {};
    Object.keys(gradebooks).forEach(function (subject) {
      next[subject] = (gradebooks[subject] || []).filter(function (entry) {
        return entry.id !== linkedId;
      });
    });
    return next;
  }

  function syncSessionAssignmentToClassGradebooks(existingSession, draft) {
    const hasAssignmentGrade =
      draft.assignment.trim() !== "" &&
      draft.assignmentGradePercent !== "" &&
      Number.isFinite(Number(draft.assignmentGradePercent));

    let nextGradebooks = { ...state.classGradebooks };
    let linkedClassGradeId = draft.linkedClassGradeId || (existingSession ? existingSession.linkedClassGradeId || "" : "");

    if (!hasAssignmentGrade) {
      if (linkedClassGradeId) {
        nextGradebooks = removeLinkedClassGrade(nextGradebooks, linkedClassGradeId);
      }

      return {
        gradebooks: nextGradebooks,
        linkedClassGradeId: "",
      };
    }

    const nextEntry = {
      id: linkedClassGradeId || generateId(),
      name: draft.assignment.trim(),
      itemType: String(draft.assignmentType || "assignment").trim().toLowerCase(),
      date: draft.date,
      gradePercent: Number(draft.assignmentGradePercent),
      weightPercent:
        draft.assignmentWeightPercent !== "" && Number.isFinite(Number(draft.assignmentWeightPercent))
          ? Number(draft.assignmentWeightPercent)
          : 0,
    };

    linkedClassGradeId = nextEntry.id;
    nextGradebooks = removeLinkedClassGrade(nextGradebooks, linkedClassGradeId);

    const targetSubject = draft.subject.trim();
    const existingEntries = nextGradebooks[targetSubject] || [];
    nextGradebooks[targetSubject] = existingEntries.concat(nextEntry);

    return {
      gradebooks: nextGradebooks,
      linkedClassGradeId: linkedClassGradeId,
    };
  }

  function getEncouragementMessage(session) {
    const subject = session.subject;
    const messages = [
      `Discipline compounds. ${subject} is logged and your progress is real.`,
      `Productivity is built one block at a time. ${subject} is now on the board.`,
      `You showed up for ${subject}. That consistency is what moves you forward.`,
      `Small disciplined actions create big results. ${subject} has been added.`,
      `Another focused session complete. ${subject} is one more proof of your momentum.`,
    ];

    return messages[Math.floor(Math.random() * messages.length)];
  }

  function calculateStudyMinutesBeforeExam(sessions, subject, examDate, assignmentName) {
    const examTime = new Date(examDate);
    const windowStart = new Date(examTime);
    windowStart.setDate(examTime.getDate() - 14);
    const normalizedAssignment = String(assignmentName || "").trim().toLowerCase();

    return sessions
      .filter(function (session) {
        const sessionTime = new Date(session.date);
        return (
          session.subject === subject &&
          String(session.category || "").trim().toLowerCase() === "study" &&
          (
            !normalizedAssignment ||
            String(session.assignment || "").trim().toLowerCase() === normalizedAssignment
          ) &&
          sessionTime >= windowStart &&
          sessionTime <= examTime
        );
      })
      .reduce(function (sum, session) {
        return sum + session.durationMinutes;
      }, 0);
  }

  function buildAiCoachPayload(sessions, grades, classGradebooks) {
    const recentSessions = sessions
      .slice()
      .sort(function (a, b) {
        return new Date(b.date) - new Date(a.date);
      })
      .slice(0, 30)
      .map(function (session) {
        return {
          subject: session.subject,
          assignment: session.assignment,
          assignmentType: session.assignmentType,
          assignmentGradePercent: session.assignmentGradePercent,
          assignmentWeightPercent: session.assignmentWeightPercent,
          date: session.date,
          durationMinutes: session.durationMinutes,
          category: session.category,
          notes: session.notes,
        };
      });

    const subjectTotals = Array.from(
      sessions.reduce(function (map, session) {
        const current = map.get(session.subject) || 0;
        map.set(session.subject, current + session.durationMinutes);
        return map;
      }, new Map()).entries()
    )
      .sort(function (a, b) {
        return b[1] - a[1];
      })
      .map(function (entry) {
        return {
          subject: entry[0],
          totalMinutes: entry[1],
        };
      });

    const classSnapshots = Object.keys(classGradebooks)
      .sort()
      .map(function (subject) {
        const entries = classGradebooks[subject] || [];
        const metrics = calculateClassMetrics(entries);
        return {
          subject: subject,
          gpa: Number(formatGpa(metrics.gpa)),
          weightedAverage: Math.round(metrics.weightedAverage * 10) / 10,
          totalWeight: Math.round(metrics.totalWeight * 10) / 10,
          upcomingItems: entries
            .slice()
            .sort(function (a, b) {
              return new Date(a.date) - new Date(b.date);
            })
            .slice(0, 8)
            .map(function (entry) {
              return {
                name: entry.name,
                itemType: entry.itemType,
                date: entry.date,
                gradePercent: entry.gradePercent,
                weightPercent: entry.weightPercent,
              };
            }),
        };
      });

    return {
      generatedAt: new Date().toISOString(),
      school: state.currentUser && state.currentUser.school ? state.currentUser.school : "",
      classCatalog: (state.classCatalog || []).map(function (entry) {
        return {
          name: entry.name,
          code: entry.code,
        };
      }),
      recentSessions: recentSessions,
      manualGrades: grades.slice(0, 12).map(function (grade) {
        return {
          subject: grade.subject,
          examName: grade.examName,
          examDate: grade.examDate,
          gradePercent: grade.gradePercent,
          notes: grade.notes,
        };
      }),
      subjectTotals: subjectTotals,
      classSnapshots: classSnapshots,
    };
  }

  function buildAiPlanPayload(sessions, grades, classGradebooks) {
    const recentSessions = sessions
      .slice()
      .sort(function (a, b) {
        return new Date(b.date) - new Date(a.date);
      })
      .slice(0, 12);

    const researchedTopics = [];
    const seenTopics = new Set();

    recentSessions.forEach(function (session) {
      const topic = String(session.assignment || "").trim();
      const subject = String(session.subject || "").trim();
      if (!topic || !subject) {
        return;
      }

      const key = `${subject.toLowerCase()}::${topic.toLowerCase()}`;
      if (seenTopics.has(key) || researchedTopics.length >= 3) {
        return;
      }

      seenTopics.add(key);
      researchedTopics.push({
        subject: subject,
        topic: topic,
        assignmentType: session.assignmentType || "",
      });
    });

    const classSummaries = Object.keys(classGradebooks)
      .sort()
      .slice(0, 6)
      .map(function (subject) {
        const entries = classGradebooks[subject] || [];
        const metrics = calculateClassMetrics(entries);
        return {
          subject: subject,
          weightedAverage: Math.round(metrics.weightedAverage * 10) / 10,
          totalWeight: Math.round(metrics.totalWeight * 10) / 10,
          upcomingItems: entries
            .slice()
            .sort(function (a, b) {
              return new Date(a.date) - new Date(b.date);
            })
            .slice(0, 3)
            .map(function (entry) {
              return {
                name: entry.name,
                itemType: entry.itemType,
                date: entry.date,
                gradePercent: entry.gradePercent,
                weightPercent: entry.weightPercent,
              };
            }),
        };
      });

    return {
      generatedAt: new Date().toISOString(),
      school: state.currentUser && state.currentUser.school ? state.currentUser.school : "",
      classCatalog: (state.classCatalog || []).map(function (entry) {
        return {
          name: entry.name,
          code: entry.code,
        };
      }),
      recentSessions: recentSessions.map(function (session) {
        return {
          subject: session.subject,
          assignment: session.assignment,
          assignmentType: session.assignmentType,
          date: session.date,
          durationMinutes: session.durationMinutes,
          category: session.category,
        };
      }),
      recentGrades: grades.slice(0, 8).map(function (grade) {
        return {
          subject: grade.subject,
          examName: grade.examName,
          examDate: grade.examDate,
          gradePercent: grade.gradePercent,
        };
      }),
      researchedTopics: researchedTopics,
      classSummaries: classSummaries,
    };
  }

  function formatCoachTimestamp(value) {
    if (!value) {
      return "";
    }

    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  }

  function renderCoachList(items, emptyText) {
    if (!items.length) {
      return `<p class="coach-empty-copy">${escapeHtml(emptyText)}</p>`;
    }

    return `
      <div class="coach-list">
        ${items
          .map(function (item) {
            const cleanItem = String(item || "").replace(/^[-*•]\s*/, "").trim();
            return `<div class="coach-list-item"><strong>${escapeHtml(cleanItem)}</strong></div>`;
          })
          .join("")}
      </div>
    `;
  }


  function renderRoadmapChart(blocks) {
    if (!blocks || !blocks.length) {
      return `<p class="coach-empty-copy">No roadmap blocks were returned this time.</p>`;
    }

    return `
      <div class="roadmap-chart" aria-label="AI study roadmap chart">
        ${blocks
          .map(function (block, index) {
            const text = String(block || "").replace(/^[-*•]\s*/, "").trim();
            const parts = text.split(/[:|–-]/);
            const day = parts.length > 1 ? parts[0].trim() : `Block ${index + 1}`;
            const task = parts.length > 1 ? parts.slice(1).join(" - ").trim() : text;
            return `
              <div class="roadmap-step">
                <div class="roadmap-day">${escapeHtml(day)}</div>
                <div class="roadmap-block">${escapeHtml(task || text)}</div>
                ${index < blocks.length - 1 ? '<div class="roadmap-arrow">➜</div>' : ""}
              </div>
            `;
          })
          .join("")}
      </div>
    `;
  }

  function renderResearchSources(sources) {
    if (!sources.length) {
      return `<p class="coach-empty-copy">No source links were returned for this plan yet.</p>`;
    }

    return `
      <ul class="research-source-list">
        ${sources
          .map(function (source) {
            return `
              <li>
                <a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">
                  ${escapeHtml(source.title || source.url)}
                </a>
              </li>
            `;
          })
          .join("")}
      </ul>
    `;
  }

  function renderAiCoachPanel(sessions, grades, classGradebooks, aiCoach) {
    const hasData = sessions.length > 0 || grades.length > 0 || Object.keys(classGradebooks).length > 0;

    return `
      <section class="panel ai-coach-panel">
        <div class="panel-header">
          <div>
            <p class="eyebrow">AI Study Coach</p>
            <h2>Personalized study guidance</h2>
          </div>
          <p class="panel-copy">Generate a quick coaching read on your recent study history, class progress, and where your next effort should go.</p>
        </div>

        <div class="coach-status-row">
          <div class="coach-chip">
            <span class="insight-label">Status</span>
            <strong>${aiCoach.loading ? "Thinking" : aiCoach.result ? "Ready" : "Idle"}</strong>
          </div>
          <div class="coach-chip">
            <span class="insight-label">Last Run</span>
            <strong>${aiCoach.lastUpdated ? escapeHtml(formatCoachTimestamp(aiCoach.lastUpdated)) : "Not yet"}</strong>
          </div>
        </div>

        ${
          hasData
            ? `<div class="form-actions">
                <button class="primary-button" type="button" data-action="generate-ai-coach" ${aiCoach.loading ? "disabled" : ""}>
                  ${aiCoach.loading ? "Generating Advice..." : "Generate AI Study Coach"}
                </button>
              </div>`
            : `<div class="empty-state compact-empty-state">
                <h3>Nothing to coach yet</h3>
                <p>Log a few sessions or add class grades first so the AI coach has enough context to give useful advice.</p>
              </div>`
        }

        ${
          aiCoach.error
            ? `<div class="coach-alert">${escapeHtml(aiCoach.error)}</div>`
            : ""
        }

        ${
          aiCoach.result
            ? `
              <div class="coach-output">
                <div class="coach-summary-card">
                  <p class="eyebrow">Headline</p>
                  <h3>${escapeHtml(aiCoach.result.headline || "Your study snapshot is ready.")}</h3>
                  <p>${escapeHtml(aiCoach.result.summary || "The AI coach generated a fresh review of your recent study data.")}</p>
                </div>

                <div class="coach-columns">
                  <div class="coach-section">
                    <p class="eyebrow">Top Priorities</p>
                    ${renderCoachList(
                      aiCoach.result.priorities || [],
                      "No priorities were returned this time."
                    )}
                  </div>
                  <div class="coach-section">
                    <p class="eyebrow">Risks To Watch</p>
                    ${renderCoachList(
                      aiCoach.result.risks || [],
                      "No major risks were called out."
                    )}
                  </div>
                </div>

                <div class="coach-section">
                  <p class="eyebrow">Next Steps</p>
                  ${renderCoachList(
                    aiCoach.result.nextSteps || [],
                    "No next steps were returned this time."
                  )}
                </div>
              </div>
            `
            : ""
        }
      </section>
    `;
  }

  function renderStudyPlanPanel(sessions, grades, classGradebooks, aiPlan) {
    const hasData = sessions.length > 0 || grades.length > 0 || Object.keys(classGradebooks).length > 0 || state.classCatalog.length > 0;

    return `
      <section class="panel ai-coach-panel study-plan-panel">
        <div class="panel-header">
          <div>
            <p class="eyebrow">AI Study Planner + Roadmap</p>
            <h2>Generate one clear study plan</h2>
          </div>
          <p class="panel-copy">Get one formatted answer: what to focus on this week, a day-by-day roadmap chart, and researched class/topic advice based on your school, class codes, grades, and logged work.</p>
        </div>

        <div class="coach-status-row">
          <div class="coach-chip">
            <span class="insight-label">Status</span>
            <strong>${aiPlan.loading ? "Planning" : aiPlan.result ? "Ready" : "Idle"}</strong>
          </div>
          <div class="coach-chip">
            <span class="insight-label">Last Run</span>
            <strong>${aiPlan.lastUpdated ? escapeHtml(formatCoachTimestamp(aiPlan.lastUpdated)) : "Not yet"}</strong>
          </div>
        </div>

        ${
          hasData
            ? `<div class="form-actions">
                <button class="primary-button" type="button" data-action="generate-ai-plan" ${aiPlan.loading ? "disabled" : ""}>
                  ${aiPlan.loading ? "Building Planner + Roadmap..." : "Generate AI Planner + Roadmap"}
                </button>
              </div>`
            : `<div class="empty-state compact-empty-state">
                <h3>Nothing to plan yet</h3>
                <p>Log a few sessions or add class grades first so the AI can build a meaningful study plan.</p>
              </div>`
        }

        ${
          aiPlan.error
            ? `<div class="coach-alert">${escapeHtml(aiPlan.error)}</div>`
            : ""
        }

        ${
          aiPlan.result
            ? `
              <div class="coach-output">
                <div class="coach-summary-card">
                  <p class="eyebrow">1. Focus Until The Next Exam</p>
                  <h3>${escapeHtml(aiPlan.result.headline || "Your study plan is ready.")}</h3>
                  <p>${escapeHtml(aiPlan.result.summary || "The AI generated a practical study plan from your current data.")}</p>
                </div>

                <div class="coach-columns">
                  <div class="coach-section">
                    <p class="eyebrow">Priority Focus</p>
                    ${renderCoachList(
                      aiPlan.result.focusAreas || [],
                      "No focus areas were returned this time."
                    )}
                  </div>
                  <div class="coach-section">
                    <p class="eyebrow">Quick Study Blocks</p>
                    ${renderCoachList(
                      aiPlan.result.studyBlocks || [],
                      "No study blocks were returned this time."
                    )}
                  </div>
                </div>

                <div class="coach-section roadmap-section">
                  <p class="eyebrow">2. Roadmap Chart</p>
                  ${renderRoadmapChart(aiPlan.result.roadmapChart || aiPlan.result.studyBlocks || [])}
                </div>

                <div class="coach-columns">
                  <div class="coach-section">
                    <p class="eyebrow">3. Researched Class / Chapter</p>
                    ${renderCoachList(
                      aiPlan.result.researchedTopics || [],
                      "No researched topics were returned this time."
                    )}
                  </div>
                  <div class="coach-section">
                    <p class="eyebrow">What To Actually Study</p>
                    ${renderCoachList(
                      aiPlan.result.topicGuidance || [],
                      "No topic guidance was returned this time."
                    )}
                  </div>
                </div>

                <div class="coach-section">
                  <p class="eyebrow">Execution Tips</p>
                  ${renderCoachList(
                    aiPlan.result.tips || [],
                    "No execution tips were returned this time."
                  )}
                </div>

                <div class="coach-section">
                  <p class="eyebrow">Research Sources</p>
                  ${renderResearchSources(aiPlan.result.sources || [])}
                </div>
              </div>
            `
            : ""
        }
      </section>
    `;
  }

  async function requestAiCoach() {
    if (state.aiCoach.loading) {
      return;
    }

    state.aiCoach.loading = true;
    state.aiCoach.error = "";
    render();

    try {
      const response = await window.fetch("/api/study-coach", {
        credentials: "same-origin",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildAiCoachPayload(state.sessions, state.grades, state.classGradebooks)),
      });

      const payload = await response.json().catch(function () {
        return {};
      });

      if (!response.ok) {
        throw new Error(payload.error || "The AI coach request failed.");
      }

      state.aiCoach.result = payload.coach || null;
      state.aiCoach.lastUpdated = new Date().toISOString();
      state.aiCoach.error = "";
    } catch (error) {
      const isFileProtocol = window.location.protocol === "file:";
      state.aiCoach.error = isFileProtocol
        ? "AI Study Coach needs the Render server running. Open the project through Render or run `npm start` locally to use it."
        : (error && error.message) || "The AI coach could not generate advice right now.";
    } finally {
      state.aiCoach.loading = false;
      render();
    }
  }

  async function requestAiPlan() {
    if (state.aiPlan.loading) {
      return;
    }

    state.aiPlan.loading = true;
    state.aiPlan.error = "";
    render();

    try {
      const response = await window.fetch("/api/study-plan", {
        credentials: "same-origin",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildAiPlanPayload(state.sessions, state.grades, state.classGradebooks)),
      });

      const responseText = await response.text();
      let payload = {};

      try {
        payload = responseText ? JSON.parse(responseText) : {};
      } catch (_error) {
        payload = {};
      }

      if (!response.ok) {
        throw new Error(
          payload.error ||
            responseText ||
            `The AI study plan request failed with status ${response.status}.`
        );
      }

      state.aiPlan.result = payload.plan || null;
      state.aiPlan.lastUpdated = new Date().toISOString();
      state.aiPlan.error = "";
    } catch (error) {
      const isFileProtocol = window.location.protocol === "file:";
      state.aiPlan.error = isFileProtocol
        ? "AI Study Plan needs the Render server running. Open the project through Render or run `npm start` locally to use it."
        : (error && error.message) || "The AI study plan could not be generated right now.";
    } finally {
      state.aiPlan.loading = false;
      render();
    }
  }


  function buildCalendarSyncSessions() {
    return state.sessions
      .slice()
      .sort(function (a, b) {
        return new Date(a.date) - new Date(b.date);
      })
      .slice(0, 5);
  }

  function connectGoogleCalendar() {
    if (!state.currentUser || !state.currentUser.id) {
      state.calendar.error = "Sign in before connecting Google Calendar.";
      render();
      return;
    }

    window.location.href = "/api/google/connect";
  }

  async function requestCalendarStatus() {
    if (!state.currentUser || !state.currentUser.id || state.calendar.loading) {
      return;
    }

    state.calendar.loading = true;
    state.calendar.error = "";
    render();

    try {
      const response = await window.fetch("/api/google/status", { credentials: "same-origin" });
      const payload = await response.json().catch(function () {
        return {};
      });

      if (!response.ok) {
        throw new Error(payload.error || "Calendar status could not be checked.");
      }

      state.calendar.connected = Boolean(payload.connected);
      state.calendar.connectedAt = payload.connectedAt || "";
      state.calendar.error = "";
    } catch (error) {
      const isFileProtocol = window.location.protocol === "file:";
      state.calendar.error = isFileProtocol
        ? "Google Calendar needs the Render/Node server running. Use `npm start` locally or open the deployed Render site."
        : (error && error.message) || "Calendar status could not be checked.";
    } finally {
      state.calendar.loading = false;
      render();
    }
  }

  async function syncGoogleCalendarSessions() {
    if (!state.currentUser || !state.currentUser.id || state.calendar.syncing) {
      return;
    }

    const sessionsToSync = buildCalendarSyncSessions();
    if (!sessionsToSync.length) {
      state.calendar.error = "Log at least one study session before syncing Google Calendar.";
      render();
      return;
    }

    state.calendar.syncing = true;
    state.calendar.error = "";
    state.calendar.message = "";
    render();

    try {
      const response = await window.fetch("/api/google/events", {
        credentials: "same-origin",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: state.currentUser.id,
          sessions: sessionsToSync,
        }),
      });
      const payload = await response.json().catch(function () {
        return {};
      });

      if (!response.ok) {
        throw new Error(payload.error || "Google Calendar sync failed.");
      }

      const count = Array.isArray(payload.createdEvents) ? payload.createdEvents.length : 0;
      state.calendar.connected = true;
      state.calendar.lastSyncedAt = new Date().toISOString();
      state.calendar.message = `${count} study session${count === 1 ? "" : "s"} added to Google Calendar.`;
      state.calendar.error = "";
    } catch (error) {
      state.calendar.error = (error && error.message) || "Google Calendar sync failed.";
    } finally {
      state.calendar.syncing = false;
      render();
    }
  }

  function handleCalendarRedirectMessage() {
    if (!window.URLSearchParams) {
      return;
    }

    const params = new URLSearchParams(window.location.search || "");
    const calendarResult = params.get("calendar");
    if (!calendarResult) {
      return;
    }

    state.currentPage = "calendar";
    if (calendarResult === "connected") {
      state.calendar.connected = true;
      state.calendar.message = "Google Calendar connected. You can now sync saved study sessions.";
      state.calendar.error = "";
    } else if (calendarResult === "error") {
      state.calendar.error = params.get("message") || "Google Calendar could not connect.";
      state.calendar.message = "";
    }

    window.history.replaceState({}, document.title, window.location.pathname);
  }


  function getGradeComparisonRows(sessions, grades, classGradebooks) {
    const manualGradeRows = grades.map(function (grade) {
      return {
        id: grade.id,
        subject: grade.subject,
        examName: grade.examName,
        examDate: grade.examDate,
        gradePercent: grade.gradePercent,
        notes: grade.notes,
        source: "manual",
        itemType: "exam",
        studyMinutes: calculateStudyMinutesBeforeExam(sessions, grade.subject, grade.examDate, grade.examName),
      };
    });

    const classExamRows = [];
    Object.keys(classGradebooks).forEach(function (subject) {
      (classGradebooks[subject] || []).forEach(function (entry) {
        classExamRows.push({
          id: "class-" + entry.id,
          subject: subject,
          examName: entry.name,
          examDate: entry.date,
          gradePercent: entry.gradePercent,
          notes: "Imported from " + subject + " class gradebook (" + (entry.itemType || "assignment") + ").",
          source: "class-gradebook",
          itemType: entry.itemType || "assignment",
          studyMinutes: calculateStudyMinutesBeforeExam(sessions, subject, entry.date, entry.name),
        });
      });
    });

    return manualGradeRows.concat(classExamRows).sort(function (a, b) {
      return new Date(a.examDate) - new Date(b.examDate);
    });
  }

  // PAGE RENDERERS
  // Each render function below returns an HTML string for one piece of the UI.
  async function requestSecurityStatus() {
    if (!state.currentUser || state.security.loading) {
      return;
    }

    state.security.loading = true;
    state.security.error = "";
    render();

    try {
      const response = await window.fetch("/api/security/status", {
        credentials: "same-origin",
      });
      const payload = await response.json().catch(function () {
        return {};
      });

      if (!response.ok) {
        throw new Error(payload.error || "Security status could not be loaded.");
      }

      state.security.status = payload;
      state.security.error = "";
    } catch (error) {
      state.security.error = (error && error.message) || "Security status could not be loaded.";
    } finally {
      state.security.loading = false;
      render();
    }
  }

  function renderStatusPill(isReady, readyText, missingText) {
    return `<span class="${isReady ? "status-pill success" : "status-pill warning"}">${escapeHtml(isReady ? readyText : missingText)}</span>`;
  }

  function renderSecurityPage(securityState, currentUser) {
    const status = securityState.status || {};
    const env = status.environment || {};
    const storage = status.storage || {};
    const user = status.currentUser || {};
    const routes = status.routes || {};
    const notes = Array.isArray(status.productionNotes) ? status.productionNotes : [];
    const envRows = [
      ["OpenAI API key", env.openAiConfigured],
      ["Google client ID", env.googleClientConfigured],
      ["Google client secret", env.googleSecretConfigured],
      ["Google redirect URI", env.googleRedirectConfigured],
      ["Public app URL", env.publicAppUrlConfigured],
      ["Session secret", env.sessionSecretConfigured],
      ["Token encryption key", env.tokenEncryptionConfigured],
    ];
    const routeRows = Object.entries(routes);

    return `
      <div class="page-stack">
        <section class="panel">
          <div class="panel-header list-header">
            <div>
              <p class="panel-kicker">Web Security Setup</p>
              <h2>Account security status</h2>
              <p class="panel-copy">
                Use this page to confirm account persistence, protected route wiring, and server environment readiness without using terminal commands.
              </p>
            </div>
            <button class="secondary-button" type="button" data-action="refresh-security-status" ${securityState.loading ? "disabled" : ""}>
              ${securityState.loading ? "Checking..." : "Refresh status"}
            </button>
          </div>
          ${securityState.error ? `<div class="coach-alert">${escapeHtml(securityState.error)}</div>` : ""}
          <div class="summary-cards">
            <article class="summary-card">
              <p class="summary-label">Signed-in user</p>
              <strong>${escapeHtml(user.email || (currentUser && currentUser.email) || "Not loaded")}</strong>
              <span>${escapeHtml(user.full_name || (currentUser && currentUser.name) || "Student")}</span>
            </article>
            <article class="summary-card">
              <p class="summary-label">Secure auth DB</p>
              ${renderStatusPill(Boolean(storage.securityDbExists), "Saved", "Not found")}
              <span>${escapeHtml(storage.securityDbPath || ".data/security-db.json")}</span>
            </article>
            <article class="summary-card">
              <p class="summary-label">Visible account list</p>
              ${renderStatusPill(Boolean(storage.createdAccountsExists), "Available", "Not found")}
              <span>${escapeHtml(String(storage.createdAccountsCount || 0))} saved account${Number(storage.createdAccountsCount || 0) === 1 ? "" : "s"}</span>
            </article>
            <article class="summary-card">
              <p class="summary-label">Current user persistence</p>
              ${renderStatusPill(Boolean(user.savedInSecurityDb), "In secure DB", "Missing from secure DB")}
              ${renderStatusPill(Boolean(user.listedInCreatedAccounts), "In account list", "Missing from account list")}
            </article>
          </div>
        </section>

        <section class="panel">
          <div class="panel-header">
            <p class="panel-kicker">Environment</p>
            <h2>Server configuration checklist</h2>
            <p class="panel-copy">This page only shows whether required values are present. It never displays secret values.</p>
          </div>
          <div class="subject-totals">
            ${envRows.map(function (row) {
              return `
                <div class="subject-total-row">
                  <span class="subject-total-name">${escapeHtml(row[0])}</span>
                  <span class="subject-total-time">${renderStatusPill(Boolean(row[1]), "Configured", "Missing")}</span>
                </div>
              `;
            }).join("")}
          </div>
        </section>

        <section class="panel">
          <div class="panel-header">
            <p class="panel-kicker">Protected APIs</p>
            <h2>Routes available to the web app</h2>
          </div>
          <div class="subject-totals">
            ${routeRows.map(function (row) {
              return `
                <div class="subject-total-row">
                  <span class="subject-total-name">${escapeHtml(row[0])}</span>
                  <span class="subject-total-time"><code>${escapeHtml(row[1])}</code></span>
                </div>
              `;
            }).join("") || `<div class="empty-state"><p>Refresh status to load route details.</p></div>`}
          </div>
        </section>

        <section class="panel">
          <div class="panel-header">
            <p class="panel-kicker">Production notes</p>
            <h2>What still needs setup outside the browser</h2>
          </div>
          <ul class="insight-list">
            ${notes.map(function (note) { return `<li>${escapeHtml(note)}</li>`; }).join("") || "<li>Refresh status to load setup notes.</li>"}
          </ul>
        </section>
      </div>
    `;
  }

  function renderLandingPage() {
    return `
      <main class="landing-shell">
        <section class="landing-card panel" aria-labelledby="landing-title">
          <img class="landing-logo" src="./AcademicTILT%20Branding%20Logo.png" alt="AcademicTILT logo" />
          <h1 id="landing-title">Welcome to AcademicTILT</h1>
          <div class="landing-actions" aria-label="Account options">
            <button class="primary-button" type="button" data-action="switch-auth" data-mode="login">Log In</button>
            <button class="ghost-button" type="button" data-action="switch-auth" data-mode="signup">Create Account</button>
          </div>
        </section>
      </main>
    `;
  }

  function renderAuthPage(mode, draft, errors) {
    const isSignup = mode === "signup";
    const accountCount = loadAccounts().length;

    return `
      <main class="auth-shell">
        <section class="auth-card">
          <div class="auth-copy">
            <p class="eyebrow">AcademicTILT Accounts</p>
            <h1>${isSignup ? "Create your study account." : "Welcome back to AcademicTILT."}</h1>
            <p class="hero-text">
              Sign in to keep your study sessions, class gradebooks, charts, and AI planning data separated from other students on this browser.
            </p>
            <div class="auth-benefits">
              <div>
                <strong>Account-scoped data</strong>
                <span>Your dashboard saves under your login instead of one shared browser profile.</span>
              </div>
              <div>
                <strong>Backend-ready flow</strong>
                <span>The login screen gives us a clean path to replace local accounts with real server auth later.</span>
              </div>
              <div>
                <strong>Important security note</strong>
                <span>This first version is local-only. Do not use a real password until a backend database is connected.</span>
              </div>
            </div>
          </div>

          <form class="auth-form panel" id="auth-form">
            <input type="hidden" name="mode" value="${isSignup ? "signup" : "login"}" />
            <div>
              <p class="eyebrow">${isSignup ? "New Account" : "Login"}</p>
              <h2>${isSignup ? "Start tracking progress" : "Open your dashboard"}</h2>
              <p class="panel-copy">
                ${accountCount ? `${accountCount} local account${accountCount === 1 ? "" : "s"} saved on this browser.` : "No local accounts yet. Create one to begin."}
              </p>
            </div>

            ${isSignup ? `
              <label>
                Name
                <input type="text" name="name" value="${escapeHtml(draft.name || "")}" autocomplete="name" placeholder="Alex Student" />
                ${errors.name ? `<span class="field-error">${escapeHtml(errors.name)}</span>` : ""}
              </label>
              <label>
                School
                <input type="text" name="school" value="${escapeHtml(draft.school || "")}" autocomplete="organization" placeholder="Michigan State University" />
                ${errors.school ? `<span class="field-error">${escapeHtml(errors.school)}</span>` : ""}
              </label>
            ` : ""}

            <label>
              Email
              <input type="email" name="email" value="${escapeHtml(draft.email || "")}" autocomplete="email" placeholder="you@example.com" />
              ${errors.email ? `<span class="field-error">${escapeHtml(errors.email)}</span>` : ""}
            </label>

            <label>
              Password
              <input type="password" name="password" autocomplete="${isSignup ? "new-password" : "current-password"}" placeholder="${isSignup ? "At least 8 characters" : "Your local password"}" />
              ${errors.password ? `<span class="field-error">${escapeHtml(errors.password)}</span>` : ""}
            </label>

            ${errors.form ? `<div class="coach-alert">${escapeHtml(errors.form)}</div>` : ""}

            <button class="primary-button" type="submit">${isSignup ? "Create account" : "Log in"}</button>
            <button class="ghost-button" type="button" data-action="switch-auth" data-mode="${isSignup ? "login" : "signup"}">
              ${isSignup ? "Already have an account? Log in" : "Need an account? Sign up"}
            </button>
          </form>
        </section>
      </main>
    `;
  }

  // Top navigation renderer. Add/remove pages here to change the main tabs.
  function renderNavigation(currentPage, currentUser) {
    return `
      <nav class="site-nav" aria-label="Primary navigation">
        <div class="brand-block">
          <img class="brand-logo" src="./AcademicTILT%20Branding%20Logo.png" alt="AcademicTILT logo" />
          <div>
            <p class="eyebrow">Study Tracker</p>
            <h2>AcademicTILT</h2>
          </div>
        </div>
        <div class="nav-account">
          <span>UI preview mode</span>
        </div>
        <div class="nav-links">
          ${PAGE_DEFINITIONS
            .map(function (page) {
              return `
                <button
                  class="${currentPage === page.key ? "nav-link active" : "nav-link"}"
                  type="button"
                  data-action="${page.action || "navigate"}"
                  data-page="${page.key}"
                >
                  ${page.label}
                </button>
              `;
            })
            .join("")}
        </div>
      </nav>
    `;
  }

  // Home page renderer. Best place to change the landing/dashboard content.
  function renderHomePage(sessions, timerState) {
    const totalMinutes = sessions.reduce(function (sum, session) {
      return sum + session.durationMinutes;
    }, 0);
    const recentSubject = sessions.length ? sessions[0].subject : "No sessions yet";

    return `
      <section class="page-intro">
        <div>
          <p class="eyebrow">Project Home</p>
          <h1>Build your study system, not just your study log.</h1>
        </div>
        <p class="hero-text">
          This project is your interactive study dashboard: track sessions, review charts, and stay inside a focused study block without leaving the app.
        </p>
      </section>

      <section class="home-grid">
        <article class="panel feature-panel">
          <div class="panel-header">
            <div>
              <p class="eyebrow">About The Project</p>
              <h2>What this website does</h2>
            </div>
          </div>
          <div class="feature-list">
            <div class="feature-item">
              <strong>Track sessions</strong>
              <p>Log subjects, durations, notes, and categories for every study block.</p>
            </div>
            <div class="feature-item">
              <strong>Review progress</strong>
              <p>Compare time spent across weeks, days, and classes from the charts page.</p>
            </div>
            <div class="feature-item">
              <strong>Stay focused</strong>
              <p>Use the live study block timer whenever you want a simple built-in focus tool.</p>
            </div>
          </div>
        </article>

        <article class="panel timer-panel">
          <div class="panel-header">
            <div>
              <p class="eyebrow">Current Study Block</p>
              <h2>Focus Timer</h2>
            </div>
            <p class="panel-copy">Start, pause, and reset a live timer for the study block you are working on right now.</p>
          </div>
          <div class="timer-display" id="timer-display">${formatClock(timerState.elapsedSeconds)}</div>
          <div class="timer-status">
            <span class="status-dot${timerState.isRunning ? " running" : ""}"></span>
            <span>${timerState.isRunning ? "Timer running" : "Timer paused"}</span>
          </div>
          <div class="form-actions">
            <button class="primary-button" type="button" data-action="toggle-timer">
              ${timerState.isRunning ? "Pause Timer" : "Start Timer"}
            </button>
            <button class="secondary-button" type="button" data-action="reset-timer">Reset</button>
          </div>
        </article>
      </section>

      <section class="summary-grid">
        <article class="summary-card">
          <p class="eyebrow">Sessions Logged</p>
          <h2>${sessions.length}</h2>
          <p>Total entries saved in this browser.</p>
        </article>
        <article class="summary-card">
          <p class="eyebrow">Focus Time</p>
          <h2>${formatMinutes(totalMinutes)}</h2>
          <p>Total study time recorded so far.</p>
        </article>
        <article class="summary-card">
          <p class="eyebrow">Latest Subject</p>
          <h2>${escapeHtml(recentSubject)}</h2>
          <p>Your most recently logged study focus.</p>
        </article>
      </section>

      ${renderStudyPlanPanel(sessions, state.grades, state.classGradebooks, state.aiPlan)}
    `;
  }

  function renderSummaryCards(sessions) {
    const totalMinutes = sessions.reduce(function (sum, session) {
      return sum + session.durationMinutes;
    }, 0);
    const subjectCount = new Set(
      sessions.map(function (session) {
        return session.subject;
      })
    ).size;
    const currentWeekMinutes = sessions
      .filter(function (session) {
        const sessionDate = new Date(session.date);
        const now = new Date();
        const diffInDays = (now - sessionDate) / (1000 * 60 * 60 * 24);
        return diffInDays >= 0 && diffInDays <= 7;
      })
      .reduce(function (sum, session) {
        return sum + session.durationMinutes;
      }, 0);

    const subjectTotals = new Map();
    sessions.forEach(function (session) {
      const current = subjectTotals.get(session.subject) || 0;
      subjectTotals.set(session.subject, current + session.durationMinutes);
    });

    const breakdown = Array.from(subjectTotals.entries())
      .sort(function (a, b) {
        return b[1] - a[1];
      })
      .slice(0, 4);

    return `
      <section class="summary-grid" aria-label="Study summary">
        <article class="summary-card">
          <p class="eyebrow">Total Focus Time</p>
          <h2>${formatMinutes(totalMinutes)}</h2>
          <p>Across ${sessions.length} logged study session${sessions.length === 1 ? "" : "s"}.</p>
        </article>
        <article class="summary-card">
          <p class="eyebrow">Active Subjects</p>
          <h2>${subjectCount}</h2>
          <p>Distinct subjects tracked in your browser on this device.</p>
        </article>
        <article class="summary-card">
          <p class="eyebrow">This Week</p>
          <h2>${formatMinutes(currentWeekMinutes)}</h2>
          <p>Recent effort from the last 7 days.</p>
        </article>
        <article class="summary-card subject-card">
          <p class="eyebrow">Top Subjects</p>
          ${
            breakdown.length
              ? `
                <ul class="subject-breakdown">
                  ${breakdown
                    .map(function (entry) {
                      return `
                        <li>
                          <span>${escapeHtml(entry[0])}</span>
                          <strong>${formatMinutes(entry[1])}</strong>
                        </li>
                      `;
                    })
                    .join("")}
                </ul>
              `
              : "<p>No subjects yet. Add your first session to see your study mix.</p>"
          }
        </article>
      </section>
    `;
  }

  function getWeekStart(dateInput) {
    const date = new Date(dateInput);
    date.setHours(0, 0, 0, 0);
    const day = date.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    date.setDate(date.getDate() + diff);
    return date;
  }

  function formatWeekLabel(date) {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
    }).format(date);
  }

  function getChartColor(index) {
    const palette = [
      "#b08a4b",
      "#6c4c34",
      "#3a4a32",
      "#7b2d2f",
      "#2a3444",
      "#8b6647",
      "#5f1f21",
      "#c0b09d",
    ];

    return palette[index % palette.length];
  }

  function getSubjectColor(subject, subjects) {
    const subjectIndex = subjects.indexOf(subject);
    return getChartColor(subjectIndex < 0 ? 0 : subjectIndex);
  }

  function formatWeekdayLabel(date) {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "short",
    }).format(date);
  }

  function renderWeeklyChart(
    sessions,
    selectedSubject,
    weekRange,
    selectedWeekKey,
    chartMode,
    selectedDayKey
  ) {
    const subjects = Array.from(
      new Set(
        sessions.map(function (session) {
          return session.subject;
        })
      )
    ).sort();

    const weekStarts = [];
    const currentWeekStart = getWeekStart(new Date());
    const currentWeekKey = currentWeekStart.toISOString().slice(0, 10);
    const totalWeeks = weekRange || 6;
    const isWeekBreakdownMode = chartMode === "week-breakdown";

    for (let offset = totalWeeks - 1; offset >= 0; offset -= 1) {
      const weekStart = new Date(currentWeekStart);
      weekStart.setDate(currentWeekStart.getDate() - offset * 7);
      weekStarts.push(weekStart);
    }

    const weeklyData = weekStarts.map(function (weekStart) {
      const weekKey = weekStart.toISOString().slice(0, 10);
      const subjectTotals = {};

      subjects.forEach(function (subject) {
        subjectTotals[subject] = 0;
      });

      sessions.forEach(function (session) {
        const sessionWeekStart = getWeekStart(session.date).toISOString().slice(0, 10);
        if (sessionWeekStart === weekKey) {
          subjectTotals[session.subject] = (subjectTotals[session.subject] || 0) + session.durationMinutes;
        }
      });

      return {
        key: weekKey,
        label: weekKey === currentWeekKey ? "This Week" : formatWeekLabel(weekStart),
        totals: subjectTotals,
      };
    });

    const resolvedWeekKey =
      selectedWeekKey && weeklyData.some(function (week) { return week.key === selectedWeekKey; })
        ? selectedWeekKey
        : (weeklyData[weeklyData.length - 1] ? weeklyData[weeklyData.length - 1].key : null);

    const activeSubjects =
      selectedSubject === "all"
        ? subjects
        : subjects.filter(function (subject) {
            return subject === selectedSubject;
          });

    const selectedWeek = weeklyData.find(function (week) {
      return week.key === resolvedWeekKey;
    });

    const peakWeek = weeklyData.reduce(function (best, week) {
      const total = activeSubjects.reduce(function (sum, subject) {
        return sum + (week.totals[subject] || 0);
      }, 0);

      if (!best || total > best.total) {
        return { key: week.key, label: week.label, total: total };
      }

      return best;
    }, null);

    const breakdownWeekStart = isWeekBreakdownMode
      ? new Date((selectedWeekKey || currentWeekKey) + "T00:00:00")
      : currentWeekStart;

    const weekdayData = Array.from({ length: 7 }, function (_value, index) {
      const day = new Date(breakdownWeekStart);
      day.setDate(breakdownWeekStart.getDate() + index);
      const dayKey = day.toISOString().slice(0, 10);
      const totals = {};

      subjects.forEach(function (subject) {
        totals[subject] = 0;
      });

      sessions.forEach(function (session) {
        if (session.date.slice(0, 10) === dayKey) {
          totals[session.subject] = (totals[session.subject] || 0) + session.durationMinutes;
        }
      });

      return {
        key: dayKey,
        label: formatWeekdayLabel(day),
        totals: totals,
      };
    });

    const chartPoints = isWeekBreakdownMode ? weekdayData : weeklyData;
    const maxMinutes = Math.max(
      60,
      ...chartPoints.flatMap(function (point) {
        return activeSubjects.map(function (subject) {
          return point.totals[subject] || 0;
        });
      })
    );
    const selectedPointKey =
      isWeekBreakdownMode
        ? (selectedDayKey && weekdayData.some(function (day) { return day.key === selectedDayKey; })
            ? selectedDayKey
            : (weekdayData[weekdayData.length - 1] ? weekdayData[weekdayData.length - 1].key : null))
        : resolvedWeekKey;

    return `
      <section class="panel chart-panel">
        <div class="panel-header">
          <div>
            <p class="eyebrow">Weekly Comparison</p>
            <h2>${isWeekBreakdownMode ? "Study Time For Selected Week" : "Study Time Per Week Per Class"}</h2>
          </div>
          <p class="panel-copy">
            ${
              isWeekBreakdownMode
                ? "This view breaks the selected week into all seven days so you can compare each day's study time by class."
                : "Compare weekly study time by subject. Use the filters to isolate one class, change the date window, and inspect any week in detail."
            }
          </p>
        </div>

        <div class="chart-toolbar">
          <div class="chart-controls" role="tablist" aria-label="Filter by subject">
            <button
              class="${selectedSubject === "all" ? "filter-chip active" : "filter-chip"}"
              type="button"
              data-action="filter-subject"
              data-subject="all"
            >
              All Classes
            </button>
            ${subjects
              .map(function (subject) {
                return `
                  <button
                    class="${selectedSubject === subject ? "filter-chip active" : "filter-chip"}"
                    type="button"
                    data-action="filter-subject"
                    data-subject="${escapeHtml(subject)}"
                  >
                    ${escapeHtml(subject)}
                  </button>
                `;
              })
              .join("")}
          </div>

          <div class="chart-controls" role="tablist" aria-label="Select week range">
            <button
              class="${isWeekBreakdownMode && selectedWeekKey === currentWeekKey ? "filter-chip active" : "filter-chip"}"
              type="button"
              data-action="jump-current-week"
            >
              Current Week
            </button>
            ${[4, 6, 12]
              .map(function (range) {
                return `
                  <button
                    class="${!isWeekBreakdownMode && weekRange === range ? "filter-chip active" : "filter-chip"}"
                    type="button"
                    data-action="filter-range"
                    data-range="${range}"
                  >
                    ${range} Weeks
                  </button>
                `;
              })
              .join("")}
          </div>
        </div>

        ${
          subjects.length
            ? `
              <div class="chart-shell">
                <div class="chart-insights">
                  <div class="insight-pill">
                    <span class="insight-label">Peak Week</span>
                    <strong>${isWeekBreakdownMode ? `Week of ${escapeHtml(formatWeekLabel(breakdownWeekStart))}` : (peakWeek ? escapeHtml(peakWeek.label) : "None")}</strong>
                    <span>${isWeekBreakdownMode ? "7 day view" : (peakWeek ? formatMinutes(peakWeek.total) : "0 min")}</span>
                  </div>
                  <div class="insight-pill">
                    <span class="insight-label">Focused View</span>
                    <strong>${selectedSubject === "all" ? "All Classes" : escapeHtml(selectedSubject)}</strong>
                    <span>${isWeekBreakdownMode ? "7 day window" : `${weekRange} week window`}</span>
                  </div>
                </div>

                <div class="chart-grid" style="grid-template-columns: repeat(${chartPoints.length}, minmax(0, 1fr));" aria-label="Weekly study time chart">
                  ${chartPoints
                    .map(function (point) {
                      const totalForActiveSubjects = activeSubjects.reduce(function (sum, subject) {
                        return sum + (point.totals[subject] || 0);
                      }, 0);

                      const groupedBars = activeSubjects
                        .map(function (subject, index) {
                          const minutes = point.totals[subject] || 0;
                          const height = minutes ? Math.max((minutes / maxMinutes) * 100, 6) : 4;
                          const subjectColor = getSubjectColor(subject, subjects);

                          return `
                            <div class="chart-bar-group">
                              <div
                                class="chart-segment${minutes ? "" : " empty"}"
                                style="height:${height}%; background:${minutes ? subjectColor : "rgba(105, 123, 111, 0.28)"}"
                                title="${escapeHtml(subject)}: ${formatMinutes(minutes)}"
                              ></div>
                            </div>
                          `;
                        })
                        .join("");

                      return `
                        <button
                          class="chart-column${point.key === selectedPointKey ? " selected" : ""}"
                          type="button"
                          data-action="${isWeekBreakdownMode ? "select-day" : "select-week"}"
                          data-week="${point.key}"
                        >
                          <div class="chart-value">${totalForActiveSubjects ? formatMinutes(totalForActiveSubjects) : "0 min"}</div>
                          <div class="chart-bar-frame" title="${escapeHtml(
                            activeSubjects
                              .map(function (subject) {
                                const minutes = point.totals[subject] || 0;
                                return `${subject}: ${formatMinutes(minutes)}`;
                              })
                              .join(" | ")
                          )}">
                            <div class="chart-stack grouped">
                              ${groupedBars}
                            </div>
                          </div>
                          <div class="chart-label">${point.label}</div>
                        </button>
                      `;
                    })
                    .join("")}
                </div>

                <div class="chart-legend">
                  ${activeSubjects
                    .map(function (subject) {
                      return `
                        <div class="legend-item">
                          <span class="legend-swatch" style="background:${getSubjectColor(subject, subjects)}"></span>
                          <span>${escapeHtml(subject)}</span>
                        </div>
                      `;
                    })
                    .join("")}
                </div>

                ${
                  (isWeekBreakdownMode
                    ? chartPoints.find(function (point) { return point.key === selectedPointKey; })
                    : selectedWeek)
                    ? `
                      <div class="week-detail-card">
                        <div>
                          <p class="eyebrow">${isWeekBreakdownMode ? "Selected Day" : "Selected Week"}</p>
                          <h3>${
                            isWeekBreakdownMode
                              ? escapeHtml((chartPoints.find(function (point) { return point.key === selectedPointKey; }) || { label: "" }).label)
                              : `Week of ${escapeHtml(selectedWeek.label)}`
                          }</h3>
                        </div>
                        <div class="week-detail-list">
                          ${activeSubjects
                            .map(function (subject) {
                              const activePoint = isWeekBreakdownMode
                                ? chartPoints.find(function (point) { return point.key === selectedPointKey; })
                                : selectedWeek;
                              const minutes = activePoint.totals[subject] || 0;
                              return `
                                <div class="week-detail-row">
                                  <div class="week-detail-subject">
                                    <span class="legend-swatch" style="background:${getSubjectColor(subject, subjects)}"></span>
                                    <span>${escapeHtml(subject)}</span>
                                  </div>
                                  <strong>${formatMinutes(minutes)}</strong>
                                </div>
                              `;
                            })
                            .join("")}
                        </div>
                      </div>
                    `
                    : ""
                }
              </div>
            `
            : `
              <div class="empty-state">
                <h3>No chart data yet</h3>
                <p>Add some study sessions and the weekly comparison graph will appear here automatically.</p>
              </div>
            `
        }
      </section>
    `;
  }

  function renderGradeStudyChart() {
    const allRows = getGradeComparisonRows(state.sessions, state.grades, state.classGradebooks);
    const selectedClass = state.gradeChartClass;
    const threshold = state.gradeChartThreshold;
    const weeks = state.gradeChartWeeks;
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - weeks * 7);

    const subjects = Array.from(
      new Set(
        allRows.map(function (row) {
          return row.subject;
        })
      )
    ).sort();

    const filteredRows = allRows.filter(function (row) {
      return (
        (selectedClass === "all" || row.subject === selectedClass) &&
        row.gradePercent >= threshold &&
        new Date(row.examDate) >= windowStart
      );
    });

    const maxStudyMinutes = Math.max(
      60,
      ...filteredRows.map(function (row) {
        return row.studyMinutes;
      }),
      0
    );

    const trendPoints =
      selectedClass !== "all" && filteredRows.length > 1
        ? filteredRows
            .map(function (row, index) {
              const x = ((index + 0.5) / filteredRows.length) * 100;
              const y = 100 - row.gradePercent;
              return `${x},${y}`;
            })
            .join(" ")
        : "";

    return `
      <section class="panel chart-panel">
        <div class="panel-header">
          <div>
            <p class="eyebrow">Grade Comparison</p>
            <h2>Grade vs Study Time</h2>
          </div>
          <p class="panel-copy">See grade outcomes against prep time and filter the view by class, threshold, and recent weeks.</p>
        </div>

        <div class="analytics-filter-grid">
          <label class="sort-control">
            <span>Class</span>
            <select data-action="grade-chart-class">
              <option value="all" ${selectedClass === "all" ? "selected" : ""}>All Classes</option>
              ${subjects
                .map(function (subject) {
                  return `<option value="${escapeHtml(subject)}" ${selectedClass === subject ? "selected" : ""}>${escapeHtml(subject)}</option>`;
                })
                .join("")}
            </select>
          </label>
          <label class="sort-control">
            <span>Grade Threshold</span>
            <select data-action="grade-chart-threshold">
              ${[0, 60, 70, 80, 90]
                .map(function (value) {
                  return `<option value="${value}" ${threshold === value ? "selected" : ""}>${value}% and up</option>`;
                })
                .join("")}
            </select>
          </label>
          <label class="sort-control">
            <span>Weeks</span>
            <select data-action="grade-chart-weeks">
              ${[4, 8, 12, 24]
                .map(function (value) {
                  return `<option value="${value}" ${weeks === value ? "selected" : ""}>Last ${value} weeks</option>`;
                })
                .join("")}
            </select>
          </label>
        </div>

        ${
          filteredRows.length
            ? `
              <div class="dual-axis-shell">
                <div class="axis-header-row">
                  <span class="axis-label">Grade %</span>
                  <span class="axis-label right">Study Time</span>
                </div>
                <div class="grade-study-graph">
                  <div class="axis-scale">
                    <span>100</span>
                    <span>75</span>
                    <span>50</span>
                    <span>25</span>
                    <span>0</span>
                  </div>
                  <div class="grade-study-grid" style="grid-template-columns: repeat(${filteredRows.length}, minmax(0, 1fr));">
                    ${
                      trendPoints
                        ? `<svg class="trend-line" viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points="${trendPoints}"></polyline></svg>`
                        : ""
                    }
                    ${filteredRows
                      .map(function (row) {
                        const label = `${row.subject}: ${row.examName}`;
                        const compactLabel = row.examName || row.subject;
                        const color = getSubjectColor(row.subject, subjects);
                        const barHeight = Math.max((row.studyMinutes / maxStudyMinutes) * 100, row.studyMinutes ? 6 : 4);
                        return `
                          <div class="grade-study-column">
                            <div class="grade-study-plot">
                              <div class="study-bar" style="height:${barHeight}%; background:${color};"></div>
                              <div class="grade-point" style="bottom:calc(${row.gradePercent}% - 9px); border-color:${color};"></div>
                            </div>
                            <div class="grade-study-readout">
                              <strong>${row.gradePercent}%</strong>
                              <span>${formatMinutes(row.studyMinutes)}</span>
                            </div>
                            <div class="grade-study-label" title="${escapeHtml(label)}">
                              <span class="grade-study-label-title">${escapeHtml(compactLabel)}</span>
                              <span class="grade-study-label-date">${escapeHtml(formatDate(row.examDate))}</span>
                            </div>
                          </div>
                        `;
                      })
                      .join("")}
                  </div>
                  <div class="axis-scale right">
                    <span>${formatMinutes(maxStudyMinutes)}</span>
                    <span>${formatMinutes(Math.round(maxStudyMinutes * 0.75))}</span>
                    <span>${formatMinutes(Math.round(maxStudyMinutes * 0.5))}</span>
                    <span>${formatMinutes(Math.round(maxStudyMinutes * 0.25))}</span>
                    <span>0 min</span>
                  </div>
                </div>
                ${
                  selectedClass !== "all"
                    ? `<p class="panel-copy">Trend line is shown for ${escapeHtml(selectedClass)} while this class filter is active.</p>`
                    : ""
                }
              </div>
            `
            : `
              <div class="empty-state">
                <h3>No grade data in this filter</h3>
                <p>Try lowering the threshold, widening the week range, or selecting a different class.</p>
              </div>
            `
        }
      </section>
    `;
  }

  function renderAnalyticsPage(sessions, selectedSubject, weekRange, selectedWeekKey, chartMode, selectedDayKey) {
    return `
      <section class="page-intro compact">
        <div>
          <p class="eyebrow">Charts And Insights</p>
          <h1>See how your study time changes week to week.</h1>
        </div>
        <p class="hero-text">
          Drill into specific weeks, compare classes side by side, and spot where your time is actually going.
        </p>
      </section>

      <div class="chart-controls analytics-tabs" role="tablist" aria-label="Analytics subtab">
        <button
          class="${state.analyticsTab === "time" ? "filter-chip active" : "filter-chip"}"
          type="button"
          data-action="analytics-tab"
          data-tab="time"
        >
          Time Charts
        </button>
        <button
          class="${state.analyticsTab === "grade-study" ? "filter-chip active" : "filter-chip"}"
          type="button"
          data-action="analytics-tab"
          data-tab="grade-study"
        >
          Grade vs Study Time
        </button>
      </div>

      ${
        state.analyticsTab === "grade-study"
          ? renderGradeStudyChart()
          : `
              ${renderSummaryCards(sessions)}
              ${renderWeeklyChart(sessions, selectedSubject, weekRange, selectedWeekKey, chartMode, selectedDayKey)}
            `
      }
    `;
  }

  function renderStatsPage(sessions) {
    const totalMinutes = sessions.reduce(function (sum, session) {
      return sum + session.durationMinutes;
    }, 0);
    const totalSessions = sessions.length;
    const totalSubjects = new Set(
      sessions.map(function (session) {
        return session.subject;
      })
    ).size;
    const averageSession = totalSessions ? Math.round(totalMinutes / totalSessions) : 0;

    const subjectTotals = Array.from(
      sessions.reduce(function (map, session) {
        const current = map.get(session.subject) || 0;
        map.set(session.subject, current + session.durationMinutes);
        return map;
      }, new Map()).entries()
    ).sort(function (a, b) {
      return b[1] - a[1];
    });

    const bestSubject = subjectTotals[0] || null;

    const dayTotals = Array.from({ length: 7 }, function (_value, index) {
      return { day: index, minutes: 0 };
    });

    sessions.forEach(function (session) {
      const date = new Date(session.date);
      const day = date.getDay();
      dayTotals[day].minutes += session.durationMinutes;
    });

    const strongestDay = dayTotals.reduce(function (best, current) {
      if (!best || current.minutes > best.minutes) {
        return current;
      }
      return best;
    }, null);

    const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const maxSubjectMinutes = Math.max(
      60,
      ...subjectTotals.map(function (entry) {
        return entry[1];
      }),
      0
    );
    const gradeRows = getGradeComparisonRows(sessions, state.grades, state.classGradebooks).sort(function (a, b) {
      return new Date(b.examDate) - new Date(a.examDate);
    });

    return `
      <section class="page-intro compact">
        <div>
          <p class="eyebrow">Statistics Center</p>
          <h1>See how your time is really being spent.</h1>
        </div>
        <p class="hero-text">
          Review subject percentages, time totals, average session length, and the study habits that stand out most.
        </p>
      </section>

      <section class="summary-grid">
        <article class="summary-card">
          <p class="eyebrow">Total Study Time</p>
          <h2>${formatMinutes(totalMinutes)}</h2>
          <p>All logged study time in this browser.</p>
        </article>
        <article class="summary-card">
          <p class="eyebrow">Average Session</p>
          <h2>${formatMinutes(averageSession)}</h2>
          <p>Typical session length across your log.</p>
        </article>
        <article class="summary-card">
          <p class="eyebrow">Subjects Tracked</p>
          <h2>${totalSubjects}</h2>
          <p>Distinct classes currently represented.</p>
        </article>
      </section>

      <section class="stats-grid">
        <article class="panel">
          <div class="panel-header">
            <div>
              <p class="eyebrow">Subject Breakdown</p>
              <h2>Study Time Per Subject</h2>
            </div>
            <p class="panel-copy">See the total and percentage share for each class.</p>
          </div>

          ${
            subjectTotals.length
              ? `
                <div class="stats-list">
                  ${subjectTotals
                    .map(function (entry, index) {
                      const subject = entry[0];
                      const minutes = entry[1];
                      const percentage = totalMinutes ? Math.round((minutes / totalMinutes) * 100) : 0;
                      const width = Math.max((minutes / maxSubjectMinutes) * 100, 8);
                      const color = getSubjectColor(
                        subject,
                        subjectTotals.map(function (item) {
                          return item[0];
                        })
                      );

                      return `
                        <div class="stat-row">
                          <div class="stat-row-top">
                            <div class="stat-subject">
                              <span class="legend-swatch" style="background:${color}"></span>
                              <strong>${escapeHtml(subject)}</strong>
                            </div>
                            <div class="stat-values">
                              <span>${formatMinutes(minutes)}</span>
                              <span>${percentage}%</span>
                            </div>
                          </div>
                          <div class="stat-bar-track">
                            <div class="stat-bar-fill" style="width:${width}%; background:${color};"></div>
                          </div>
                        </div>
                      `;
                    })
                    .join("")}
                </div>
              `
              : `
                <div class="empty-state">
                  <h3>No stats yet</h3>
                  <p>Log a few study sessions and your subject percentages will appear here.</p>
                </div>
              `
          }
        </article>

        <article class="panel">
          <div class="panel-header">
            <div>
              <p class="eyebrow">Critical Stats</p>
              <h2>What Matters Most</h2>
            </div>
            <p class="panel-copy">High-level signals that help you see your study patterns quickly.</p>
          </div>

          <div class="critical-stats">
            <div class="feature-item">
              <strong>Top Subject</strong>
              <p>${bestSubject ? `${escapeHtml(bestSubject[0])} with ${formatMinutes(bestSubject[1])}` : "No study data yet"}</p>
            </div>
            <div class="feature-item">
              <strong>Most Active Day</strong>
              <p>${
                strongestDay && strongestDay.minutes
                  ? `${weekdayLabels[strongestDay.day]} with ${formatMinutes(strongestDay.minutes)}`
                  : "Not enough data yet"
              }</p>
            </div>
            <div class="feature-item">
              <strong>Total Sessions</strong>
              <p>${totalSessions} session${totalSessions === 1 ? "" : "s"} recorded so far.</p>
            </div>
            <div class="feature-item">
              <strong>Focus Balance</strong>
              <p>${
                subjectTotals.length > 1
                  ? `${Math.round((subjectTotals[0][1] / totalMinutes) * 100)}% of your time is going to ${escapeHtml(subjectTotals[0][0])}.`
                  : "Add more than one subject to compare balance across classes."
              }</p>
            </div>
          </div>
        </article>
      </section>

      <section class="panel grade-panel">
        <div class="panel-header">
          <div>
            <p class="eyebrow">Grades Vs Study Time</p>
            <h2>Compare Exam Results To Preparation</h2>
          </div>
          <p class="panel-copy">Log your past grades and compare each result to the amount of study time you logged in the 14 days leading up to that exam.</p>
        </div>

        <div class="grade-layout">
          <form id="grade-form" class="grade-form">
            <div class="form-grid">
              <label>
                <span>Class</span>
                <input type="text" name="subject" maxlength="60" placeholder="Biology" required />
              </label>
              <label>
                <span>Exam Name</span>
                <input type="text" name="examName" maxlength="80" placeholder="Midterm 1" required />
              </label>
              <label>
                <span>Exam Date</span>
                <input type="date" name="examDate" required />
              </label>
              <label>
                <span>Grade (%)</span>
                <input type="number" name="gradePercent" min="0" max="100" step="0.1" placeholder="92" required />
              </label>
            </div>
            <label>
              <span>Notes</span>
              <textarea name="notes" rows="3" maxlength="220" placeholder="Optional notes about the exam or how prepared you felt"></textarea>
            </label>
            <div class="form-actions">
              <button class="primary-button" type="submit">Save Grade Entry</button>
            </div>
          </form>

          <div class="grade-list">
            ${
              gradeRows.length
                ? gradeRows
                    .map(function (entry) {
                      return `
                        <article class="grade-item">
                          <div class="grade-top">
                            <div>
                              <p class="eyebrow">${escapeHtml(formatClassLabel(entry.subject))}</p>
                              <h3>${escapeHtml(entry.examName)}</h3>
                            </div>
                            <div class="grade-badge">${entry.gradePercent}%</div>
                          </div>
                          <p class="grade-meta">
                            <span>${formatDate(entry.examDate)}</span>
                            <span>${formatMinutes(entry.studyMinutes)} studied before exam</span>
                            <span>${entry.source === "class-gradebook" ? "From Classes page" : "Manual entry"}</span>
                          </p>
                          ${
                            entry.notes
                              ? `<p class="session-notes">${escapeHtml(entry.notes)}</p>`
                              : ""
                          }
                          ${
                            entry.source === "manual"
                              ? `
                                <div class="session-actions">
                                  <button class="ghost-button" type="button" data-action="delete-grade" data-id="${escapeHtml(entry.id)}">
                                    Delete
                                  </button>
                                </div>
                              `
                              : ""
                          }
                        </article>
                      `;
                    })
                    .join("")
                : `
                  <div class="empty-state">
                    <h3>No grade comparisons yet</h3>
                    <p>Add a past exam result to start comparing your grades with logged study time.</p>
                  </div>
                `
            }
          </div>
        </div>
      </section>
    `;
  }

  function renderCalendarPage(calendarState, sessions) {
    const connected = Boolean(calendarState.connected);
    const recentSessions = sessions
      .slice()
      .sort(function (a, b) {
        return new Date(a.date) - new Date(b.date);
      })
      .slice(0, 5);

    return `
      <section class="page-intro compact">
        <div>
          <p class="eyebrow">Calendar Hub</p>
          <h1>Plan, connect, and sync your study schedule.</h1>
        </div>
        <p class="hero-text">
          This page now matches the README plan: connect Google Calendar with OAuth, keep credentials on the Node/Render backend, and push saved AcademicTILT study sessions into your primary calendar.
        </p>
      </section>

      <section class="home-grid calendar-grid">
        <article class="panel feature-panel">
          <div class="panel-header">
            <div>
              <p class="eyebrow">Calendar Plan</p>
              <h2>What this page is built to do</h2>
            </div>
            <p class="panel-copy">The README calls for Google OAuth, saved-session syncing, and future smart scheduling. This workspace now shows the current working flow and the upcoming roadmap in one place.</p>
          </div>

          <div class="feature-list">
            <div class="feature-item">
              <strong>1. Connect Google OAuth</strong>
              <p>Use the configured Google Cloud OAuth client and authorize the narrow Calendar Events scope.</p>
            </div>
            <div class="feature-item">
              <strong>2. Sync saved study sessions</strong>
              <p>AcademicTILT turns your saved sessions into calendar event payloads and sends them from the server.</p>
            </div>
            <div class="feature-item">
              <strong>3. Protect secrets on the backend</strong>
              <p>OAuth token exchange, token refresh, and event creation stay inside the Node/Render API routes.</p>
            </div>
          </div>

          <div class="calendar-roadmap">
            <div>
              <span class="insight-label">Current</span>
              <strong>Saved-session sync</strong>
              <p>Connect Google Calendar and send up to five saved study sessions at a time.</p>
            </div>
            <div>
              <span class="insight-label">Next</span>
              <strong>AI study blocks</strong>
              <p>Turn generated study plans into scheduled events once planner blocks are saved as sessions.</p>
            </div>
            <div>
              <span class="insight-label">Future</span>
              <strong>Two-way calendar sync</strong>
              <p>Read availability, avoid conflicts, and schedule around exams when production auth is ready.</p>
            </div>
          </div>
        </article>

        <article class="panel calendar-sync-panel">
          <div class="panel-header">
            <div>
              <p class="eyebrow">Connection Status</p>
              <h2>${connected ? "Calendar Connected" : "Calendar Not Connected"}</h2>
            </div>
            <p class="panel-copy">${connected ? "You can now push saved AcademicTILT sessions into your primary Google Calendar." : "Add your Google OAuth credentials to the server, then connect this AcademicTILT account."}</p>
          </div>

          <div class="coach-status-row">
            <div class="coach-chip">
              <span class="insight-label">Google OAuth</span>
              <strong>${calendarState.loading ? "Checking" : connected ? "Connected" : "Not connected"}</strong>
            </div>
            <div class="coach-chip">
              <span class="insight-label">Last Sync</span>
              <strong>${calendarState.lastSyncedAt ? escapeHtml(formatCoachTimestamp(calendarState.lastSyncedAt)) : "Not yet"}</strong>
            </div>
          </div>

          ${
            calendarState.error
              ? `<div class="coach-alert">${escapeHtml(calendarState.error)}</div>`
              : ""
          }

          ${
            calendarState.message
              ? `<div class="coach-summary-card calendar-success"><p>${escapeHtml(calendarState.message)}</p></div>`
              : ""
          }

          <div class="form-actions calendar-actions">
            <button class="primary-button" type="button" data-action="connect-google-calendar">
              ${connected ? "Reconnect Google Calendar" : "Connect Google Calendar"}
            </button>
            <a class="secondary-button button-link" href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer">
              Set Up Google OAuth
            </a>
            <button class="secondary-button" type="button" data-action="refresh-google-calendar-status" ${calendarState.loading ? "disabled" : ""}>
              ${calendarState.loading ? "Checking..." : "Refresh Status"}
            </button>
            <button class="secondary-button" type="button" data-action="sync-google-calendar" ${!connected || calendarState.syncing || !recentSessions.length ? "disabled" : ""}>
              ${calendarState.syncing ? "Syncing..." : "Sync Saved Sessions"}
            </button>
          </div>

          <div class="calendar-preview">
            <p class="eyebrow">Ready To Sync</p>
            ${
              recentSessions.length
                ? `<div class="coach-list">
                    ${recentSessions
                      .map(function (session) {
                        return `<div class="coach-list-item calendar-preview-item">
                          <strong>${escapeHtml(session.subject)}</strong>
                          <span>${escapeHtml(formatDisplayDate(session.date))} • ${escapeHtml(formatMinutes(session.durationMinutes))}</span>
                        </div>`;
                      })
                      .join("")}
                  </div>`
                : `<div class="empty-state compact-empty-state"><h3>No sessions yet</h3><p>Log study sessions first, then come back here to sync them into Google Calendar.</p></div>`
            }
          </div>
        </article>
      </section>
    `;
  }

  function renderClassesOverview(subjects, selectedClass, classGradebooks) {
    const classCards = subjects.map(function (subject) {
      const metrics = calculateClassMetrics(classGradebooks[subject] || []);
      return {
        subject: subject,
        gpa: metrics.gpa,
        weightedAverage: metrics.weightedAverage,
        totalWeight: metrics.totalWeight,
      };
    });

    const classesWithGrades = classCards.filter(function (entry) {
      return entry.totalWeight > 0;
    });

    const semesterGpa =
      classesWithGrades.length > 0
        ? classesWithGrades.reduce(function (sum, entry) {
            return sum + entry.gpa;
          }, 0) / classesWithGrades.length
        : 0;

    return `
      <section class="page-intro compact">
        <div>
          <p class="eyebrow">Classes</p>
          <h1>Track every class and its grade picture.</h1>
        </div>
        <p class="hero-text">
          Open any class to manage weighted assignments and keep a running class GPA that updates as your grades change.
        </p>
      </section>

      <section class="summary-grid">
        <article class="summary-card">
          <p class="eyebrow">Semester GPA</p>
          <h2>${formatGpa(semesterGpa)}</h2>
          <p>Cumulative GPA across classes with saved weighted grades.</p>
        </article>
        <article class="summary-card">
          <p class="eyebrow">Classes</p>
          <h2>${subjects.length}</h2>
          <p>Total classes currently known in your AcademicTILT.</p>
        </article>
        <article class="summary-card">
          <p class="eyebrow">Graded Classes</p>
          <h2>${classesWithGrades.length}</h2>
          <p>Classes already using the GPA calculator.</p>
        </article>
      </section>

      <section class="panel class-roster-panel">
        <div class="panel-header">
          <div>
            <p class="eyebrow">Create A Class</p>
            <h2>Add class name and code</h2>
          </div>
          <p class="panel-copy">Enter both the class and class code (for example, Calculus I and MTH 131) so AI planning can research the right course context.</p>
        </div>
        <form id="class-catalog-form" class="class-entry-form" novalidate>
          <div class="form-grid">
            <label>
              <span>Class</span>
              <input type="text" name="className" value="${escapeHtml(state.classDraft.name || "")}" placeholder="Calculus I" required />
              ${state.classErrors.name ? `<small class="field-error">${escapeHtml(state.classErrors.name)}</small>` : ""}
            </label>
            <label>
              <span>Class Code</span>
              <input type="text" name="classCode" value="${escapeHtml(state.classDraft.code || "")}" placeholder="MTH 131" required />
              ${state.classErrors.code ? `<small class="field-error">${escapeHtml(state.classErrors.code)}</small>` : ""}
            </label>
          </div>
          <div class="form-actions">
            <button class="primary-button" type="submit">Create Class</button>
          </div>
        </form>
      </section>

      <section class="panel">
        <div class="panel-header">
          <div>
            <p class="eyebrow">Class List</p>
            <h2>Your Classes</h2>
          </div>
          <p class="panel-copy">Click a class to open its gradebook and weighted GPA calculator.</p>
        </div>

        ${
          subjects.length
            ? `
              <div class="class-grid">
                ${classCards
                  .map(function (entry) {
                    return `
                      <button
                        class="class-card${selectedClass === entry.subject ? " active" : ""}"
                        type="button"
                        data-action="open-class"
                        data-subject="${escapeHtml(entry.subject)}"
                      >
                        <div class="class-card-top">
                          <p class="eyebrow">${escapeHtml(formatClassLabel(entry.subject))}</p>
                          <span class="class-card-gpa">${entry.totalWeight > 0 ? formatGpa(entry.gpa) : "--"}</span>
                        </div>
                        <h3>${escapeHtml(formatClassLabel(entry.subject))}</h3>
                        <p>${
                          entry.totalWeight > 0
                            ? `${Math.round(entry.weightedAverage)}% weighted average across ${Math.round(entry.totalWeight)}% entered weight.`
                            : "No weighted assignments entered yet."
                        }</p>
                      </button>
                    `;
                  })
                  .join("")}
              </div>
            `
            : `
              <div class="empty-state">
                <h3>No classes yet</h3>
                <p>Create your first class with a class code, then log sessions against that roster.</p>
              </div>
            `
        }
      </section>
    `;
  }

  function renderClassDetail(subject, entries) {
    const metrics = calculateClassMetrics(entries);
    const editingEntry =
      state.editingClassGrade &&
      state.editingClassGrade.subject === subject
        ? state.editingClassGrade
        : null;

    return `
      <section class="page-intro compact">
        <div>
          <p class="eyebrow">Class Detail</p>
          <h1>${escapeHtml(formatClassLabel(subject))}</h1>
        </div>
        <p class="hero-text">
          Enter assignment grades and the weight each one carries toward your final grade. Your class GPA stays here until you update it again.
        </p>
      </section>

      <section class="summary-grid">
        <article class="summary-card">
          <p class="eyebrow">Class GPA</p>
          <h2>${formatGpa(metrics.gpa)}</h2>
          <p>Calculated from your current weighted average.</p>
        </article>
        <article class="summary-card">
          <p class="eyebrow">Weighted Average</p>
          <h2>${metrics.totalWeight > 0 ? `${Math.round(metrics.weightedAverage)}%` : "--"}</h2>
          <p>Based only on assignments you have entered.</p>
        </article>
        <article class="summary-card">
          <p class="eyebrow">Weight Entered</p>
          <h2>${Math.round(metrics.totalWeight)}%</h2>
          <p>Total course weight currently represented in this class.</p>
        </article>
      </section>

      <section class="workspace-grid">
        <section class="panel">
          <div class="panel-header">
            <div>
              <p class="eyebrow">Add Assignment</p>
              <h2>Weighted Grade Entry</h2>
            </div>
            <p class="panel-copy">Assignments, projects, and exams all work here as long as you know the weight.</p>
          </div>

          <form id="class-grade-form">
            <input type="hidden" name="subject" value="${escapeHtml(subject)}" />
            <input type="hidden" name="editingId" value="${editingEntry ? escapeHtml(editingEntry.id) : ""}" />
            <div class="form-grid">
              <label>
                <span>Assignment Name</span>
                <input
                  type="text"
                  name="name"
                  maxlength="80"
                  placeholder="Exam 1"
                  value="${editingEntry ? escapeHtml(editingEntry.name) : ""}"
                  required
                />
              </label>
              <label>
                <span>Item Type</span>
                <select name="itemType">
                  <option value="assignment" ${editingEntry && editingEntry.itemType === "assignment" ? "selected" : ""}>Assignment</option>
                  <option value="quiz" ${editingEntry && editingEntry.itemType === "quiz" ? "selected" : ""}>Quiz</option>
                  <option value="exam" ${editingEntry && editingEntry.itemType === "exam" ? "selected" : ""}>Exam</option>
                  <option value="project" ${editingEntry && editingEntry.itemType === "project" ? "selected" : ""}>Project</option>
                </select>
              </label>
              <label>
                <span>Date</span>
                <input
                  type="date"
                  name="date"
                  value="${editingEntry ? escapeHtml(String(editingEntry.date || "")) : ""}"
                  required
                />
              </label>
              <label>
                <span>Grade (%)</span>
                <input
                  type="number"
                  name="gradePercent"
                  min="0"
                  max="100"
                  step="0.1"
                  placeholder="92"
                  value="${editingEntry ? editingEntry.gradePercent : ""}"
                  required
                />
              </label>
              <label>
                <span>Weight In Final Grade (%)</span>
                <input
                  type="number"
                  name="weightPercent"
                  min="0"
                  max="100"
                  step="0.1"
                  placeholder="25"
                  value="${editingEntry ? editingEntry.weightPercent : ""}"
                  required
                />
              </label>
            </div>
            <div class="form-actions">
              <button class="primary-button" type="submit">
                ${editingEntry ? "Save Changes" : "Save Assignment"}
              </button>
              ${
                editingEntry
                  ? '<button class="secondary-button" type="button" data-action="cancel-class-grade-edit">Cancel Edit</button>'
                  : ""
              }
              <button class="secondary-button" type="button" data-action="back-to-classes">Back To Classes</button>
              <button class="ghost-button" type="button" data-action="delete-class" data-subject="${escapeHtml(subject)}">
                Delete Class
              </button>
            </div>
          </form>
        </section>

        <section class="panel">
          <div class="panel-header">
            <div>
              <p class="eyebrow">Grade Table</p>
              <h2>${escapeHtml(formatClassLabel(subject))} Gradebook</h2>
            </div>
            <p class="panel-copy">Each saved item contributes to the weighted average and class GPA.</p>
          </div>

          ${
            entries.length
              ? `
                <div class="grade-table">
                  <div class="grade-table-head">
                    <span>Assignment</span>
                    <span>Type</span>
                    <span>Date</span>
                    <span>Grade</span>
                    <span>Weight</span>
                    <span>Action</span>
                  </div>
                  ${entries
                    .map(function (entry) {
                      return `
                        <div class="grade-table-row">
                          <span>${escapeHtml(entry.name)}</span>
                          <span>${escapeHtml(entry.itemType || "assignment")}</span>
                          <span>${formatDate(entry.date || new Date().toISOString().slice(0, 10))}</span>
                          <span>${entry.gradePercent}%</span>
                          <span>${entry.weightPercent}%</span>
                          <div class="session-actions">
                            <button
                              class="secondary-button"
                              type="button"
                              data-action="edit-class-grade"
                              data-subject="${escapeHtml(subject)}"
                              data-id="${escapeHtml(entry.id)}"
                            >
                              Edit
                            </button>
                            <button
                              class="ghost-button"
                              type="button"
                              data-action="delete-class-grade"
                              data-subject="${escapeHtml(subject)}"
                              data-id="${escapeHtml(entry.id)}"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      `;
                    })
                    .join("")}
                </div>
              `
              : `
                <div class="empty-state">
                  <h3>No assignments yet</h3>
                  <p>Add your first weighted assignment to start calculating this class GPA.</p>
                </div>
              `
          }
        </section>
      </section>
    `;
  }

  function renderClassesPage(sessions, grades, classGradebooks, selectedClass) {
    const subjects = getUniqueSubjects(sessions, grades, classGradebooks, state.classCatalog);

    if (selectedClass) {
      return renderClassDetail(selectedClass, classGradebooks[selectedClass] || []);
    }

    return renderClassesOverview(subjects, selectedClass, classGradebooks);
  }

  // Session form renderer. Add new study-session fields here if needed later.
  function renderSessionForm(options) {
    const draft = options.draft;
    const errors = options.errors;
    const isEditing = options.isEditing;
    const title = isEditing ? "Edit Study Session" : "Log Study Session";
    const helper = isEditing
      ? "Update the session details and save your changes."
      : "Capture what you studied, how long you focused, and any useful notes.";
    const hasAssignmentType = Boolean(draft.assignmentType);
    const assignmentLabel = draft.assignmentType
      ? `${draft.assignmentType.charAt(0).toUpperCase()}${draft.assignmentType.slice(1)} Name`
      : "Assignment / Exam";

    const classOptions = (state.classCatalog || [])
      .map(function (entry) {
        return `<option value="${escapeHtml(entry.name)}">${escapeHtml(entry.code ? entry.name + " (" + entry.code + ")" : entry.name)}</option>`;
      })
      .join("");

    return `
      <section class="panel form-panel">
        <div class="panel-header">
          <div>
            <p class="eyebrow">Session Entry</p>
            <h2>${title}</h2>
          </div>
          <p class="panel-copy">${helper}</p>
        </div>

        ${
          isEditing
            ? `
              <div class="editing-banner">
                <strong>Editing mode is on.</strong>
                <span>Update the session, then save changes or cancel to return to quick entry.</span>
              </div>
            `
            : ""
        }

        <form id="session-form" novalidate>
          <div class="form-grid">
          <label>
            <span>Class</span>
            <input
              type="text"
              name="subject"
                value="${escapeHtml(draft.subject)}"
                placeholder="Class name (example: Calculus I)"
                list="class-roster-options"
                maxlength="60"
                required
            />
            <datalist id="class-roster-options">${classOptions}</datalist>
            ${errors.subject ? `<small class="field-error">${escapeHtml(errors.subject)}</small>` : ""}
          </label>

          <label>
            <span>Assignment Type</span>
            <select name="assignmentType">
              <option value="" ${!draft.assignmentType ? "selected" : ""}>No assignment / exam</option>
              <option value="assignment" ${draft.assignmentType === "assignment" ? "selected" : ""}>Assignment</option>
              <option value="quiz" ${draft.assignmentType === "quiz" ? "selected" : ""}>Quiz</option>
              <option value="exam" ${draft.assignmentType === "exam" ? "selected" : ""}>Exam</option>
              <option value="project" ${draft.assignmentType === "project" ? "selected" : ""}>Project</option>
            </select>
          </label>

          ${
            hasAssignmentType
              ? `
                <label>
                  <span>${escapeHtml(assignmentLabel)}</span>
                  <input
                    type="text"
                    name="assignment"
                    value="${escapeHtml(draft.assignment)}"
                    placeholder="Quiz 2, Reading Notes, Midterm..."
                    maxlength="80"
                  />
                </label>

                <label>
                  <span>Grade On That ${escapeHtml(draft.assignmentType.charAt(0).toUpperCase() + draft.assignmentType.slice(1))}</span>
                  <input
                    type="number"
                    name="assignmentGradePercent"
                    min="0"
                    max="100"
                    step="0.1"
                    value="${escapeHtml(String(draft.assignmentGradePercent))}"
                    placeholder="Optional"
                  />
                </label>

                <label>
                  <span>Weight In Class Grade (%)</span>
                  <input
                    type="number"
                    name="assignmentWeightPercent"
                    min="0"
                    max="100"
                    step="0.1"
                    value="${escapeHtml(String(draft.assignmentWeightPercent))}"
                    placeholder="Optional"
                  />
                </label>
              `
              : ""
          }

          <label>
            <span>Date</span>
              <input type="date" name="date" value="${escapeHtml(draft.date)}" required />
              ${errors.date ? `<small class="field-error">${escapeHtml(errors.date)}</small>` : ""}
            </label>

            <label>
              <span>Duration (minutes)</span>
              <input
                type="number"
                name="durationMinutes"
                min="1"
                max="1440"
                step="1"
                value="${escapeHtml(String(draft.durationMinutes))}"
                required
              />
              ${
                errors.durationMinutes
                  ? `<small class="field-error">${escapeHtml(errors.durationMinutes)}</small>`
                  : ""
              }
            </label>

            <label>
              <span>Category</span>
              <input
                type="text"
                name="category"
                value="${escapeHtml(draft.category)}"
                placeholder="Revision, Homework, Reading..."
                maxlength="40"
              />
            </label>
          </div>

          <label>
            <span>Notes</span>
            <textarea
              name="notes"
              rows="4"
              maxlength="280"
              placeholder="What did you cover? What should you revisit next?"
            >${escapeHtml(draft.notes)}</textarea>
          </label>

          <div class="form-actions">
            <button class="primary-button" type="submit">
              ${isEditing ? "Save Changes" : "Add Session"}
            </button>
            ${isEditing ? '<button class="secondary-button" type="button" data-action="cancel-edit">Cancel</button>' : ""}
          </div>
        </form>
      </section>
    `;
  }

  // Sorting helper for the Sessions page.
  function getSortedSessions(sessions, sortMode) {
    const sorted = sessions.slice();

    if (sortMode === "subject-asc") {
      sorted.sort(function (a, b) {
        const bySubject = a.subject.localeCompare(b.subject);
        if (bySubject !== 0) {
          return bySubject;
        }

        return new Date(b.date) - new Date(a.date);
      });
      return sorted;
    }

    if (sortMode === "subject-desc") {
      sorted.sort(function (a, b) {
        const bySubject = b.subject.localeCompare(a.subject);
        if (bySubject !== 0) {
          return bySubject;
        }

        return new Date(b.date) - new Date(a.date);
      });
      return sorted;
    }

    sorted.sort(function (a, b) {
      return new Date(b.date) - new Date(a.date);
    });
    return sorted;
  }

  // Session list renderer for the Sessions page.
  function renderSessionList(sessions, editingId, sortMode) {
    const sortedSessions = getSortedSessions(sessions, sortMode);

    return `
      <section class="panel list-panel">
        <div class="panel-header">
          <div>
            <p class="eyebrow">Recent Sessions</p>
            <h2>Your Study Log</h2>
          </div>
          <div class="list-toolbar">
            <p class="panel-copy">Edit or remove entries whenever your study history changes.</p>
            <label class="sort-control">
              <span>Sort</span>
              <select data-action="sort-sessions" aria-label="Sort study sessions">
                <option value="date-desc" ${sortMode === "date-desc" ? "selected" : ""}>Newest First</option>
                <option value="subject-asc" ${sortMode === "subject-asc" ? "selected" : ""}>Class A-Z</option>
                <option value="subject-desc" ${sortMode === "subject-desc" ? "selected" : ""}>Class Z-A</option>
              </select>
            </label>
          </div>
        </div>

        ${
          sortedSessions.length
            ? `
              <div class="session-list">
                ${sortedSessions
                  .map(function (session) {
                    return `
                      <article class="session-item${editingId === session.id ? " is-editing" : ""}">
                        <div class="session-main">
                          <div class="session-title-row">
                            <h3>${escapeHtml(session.subject)}</h3>
                            <span class="pill">${formatMinutes(session.durationMinutes)}</span>
                          </div>
                          <p class="session-meta">
                            <span>${formatDate(session.date)}</span>
                            ${session.category ? `<span>${escapeHtml(session.category)}</span>` : ""}
                            ${session.assignment ? `<span>${escapeHtml(session.assignment)}</span>` : ""}
                            ${
                              session.assignment && session.assignmentGradePercent !== ""
                                ? `<span>${escapeHtml(String(session.assignmentGradePercent))}%</span>`
                                : ""
                            }
                          </p>
                          ${session.notes ? `<p class="session-notes">${escapeHtml(session.notes)}</p>` : ""}
                        </div>
                        <div class="session-actions">
                          <button class="secondary-button" type="button" data-action="edit" data-id="${escapeHtml(session.id)}">
                            Edit
                          </button>
                          <button class="ghost-button" type="button" data-action="delete" data-id="${escapeHtml(session.id)}">
                            Delete
                          </button>
                        </div>
                      </article>
                    `;
                  })
                  .join("")}
              </div>
            `
            : `
              <div class="empty-state">
                <h3>No sessions yet</h3>
                <p>Start by logging your first study session. Your data will be saved locally in this browser.</p>
              </div>
            `
        }
      </section>
    `;
  }

  // Full Sessions page renderer.

  function renderProfileSetupPanel() {
    const needsSchool = !(state.currentUser && state.currentUser.school);
    const needsClasses = !state.classCatalog.length;

    if (!needsSchool && !needsClasses) {
      return "";
    }

    return `
      <section class="panel onboarding-panel">
        <div class="panel-header">
          <div>
            <p class="eyebrow">Before You Log</p>
            <h2>Add your school and classes</h2>
          </div>
          <p class="panel-copy">AcademicTILT uses your school, class names, and class codes to research the right chapter, course topic, or exam area for AI study planning.</p>
        </div>
        <form id="profile-setup-form" class="class-entry-form" novalidate>
          <div class="form-grid">
            <label>
              <span>School</span>
              <input type="text" name="school" value="${escapeHtml((state.currentUser && state.currentUser.school) || "")}" placeholder="Your school or university" required />
              ${state.classErrors.school ? `<small class="field-error">${escapeHtml(state.classErrors.school)}</small>` : ""}
            </label>
            <label>
              <span>Class</span>
              <input type="text" name="className" value="${escapeHtml(state.classDraft.name || "")}" placeholder="Calculus I" required />
              ${state.classErrors.name ? `<small class="field-error">${escapeHtml(state.classErrors.name)}</small>` : ""}
            </label>
            <label>
              <span>Class Code</span>
              <input type="text" name="classCode" value="${escapeHtml(state.classDraft.code || "")}" placeholder="MTH 131" required />
              ${state.classErrors.code ? `<small class="field-error">${escapeHtml(state.classErrors.code)}</small>` : ""}
            </label>
          </div>
          <div class="form-actions">
            <button class="primary-button" type="submit">Save school and class</button>
            <button class="secondary-button" type="button" data-action="go-classes">Manage all classes</button>
          </div>
        </form>
      </section>
    `;
  }

  function renderSessionsPage(draft, errors, isEditing, sessions, editingId, sortMode) {
    return `
      <section class="page-intro compact">
        <div>
          <p class="eyebrow">Session Manager</p>
          <h1>Edit your current and past study sessions.</h1>
        </div>
        <p class="hero-text">
          Add new sessions, update older ones, and keep your study history clean from one dedicated workspace.
        </p>
      </section>

      ${
        state.flashMessage
          ? `
            <section class="flash-banner" aria-live="polite">
              <strong>${escapeHtml(state.flashMessage)}</strong>
            </section>
          `
          : ""
      }

      ${renderProfileSetupPanel()}

      <section class="workspace-grid">
        ${renderSessionForm({ draft: draft, errors: errors, isEditing: isEditing })}
        ${renderSessionList(sessions, editingId, sortMode)}
      </section>
    `;
  }

  function blankDraft() {
    return {
      subject: "",
      assignment: "",
      assignmentType: "",
      assignmentGradePercent: "",
      assignmentWeightPercent: "",
      linkedClassGradeId: "",
      date: new Date().toISOString().slice(0, 10),
      durationMinutes: 60,
      notes: "",
      category: "",
    };
  }

  // APP STATE
  // This object is the "single source of truth" for what the UI should show.
  const state = {
    currentUser: activeUser,
    authMode: "landing",
    authErrors: {},
    authDraft: { name: "", school: "", email: "", password: "" },
    sessions: activeUser ? loadSessions() : [],
    draft: blankDraft(),
    errors: {},
    editingId: null,
    currentPage: "home",
    selectedClass: null,
    analyticsTab: "time",
    editingClassGrade: null,
    sessionSort: "date-desc",
    selectedSubject: "all",
    chartWeeks: 6,
    selectedWeekKey: null,
    selectedDayKey: null,
    chartMode: "range",
    gradeChartClass: "all",
    gradeChartThreshold: 0,
    gradeChartWeeks: 12,
    timer: {
      elapsedSeconds: 0,
      isRunning: false,
    },
    grades: activeUser ? loadGrades() : [],
    classGradebooks: activeUser ? loadClassGradebooks() : {},
    classCatalog: activeUser ? loadClassCatalog() : [],
    classDraft: { name: "", code: "" },
    classErrors: {},
    aiCoach: {
      loading: false,
      error: "",
      result: null,
      lastUpdated: "",
    },
    aiPlan: {
      loading: false,
      error: "",
      result: null,
      lastUpdated: "",
    },
    calendar: {
      loading: false,
      syncing: false,
      connected: false,
      connectedAt: "",
      lastSyncedAt: "",
      error: "",
      message: "",
    },
    security: {
      loading: false,
      error: "",
      status: null,
    },
    flashMessage: "",
    flashTimeoutId: null,
  };

  function dismissFlashMessage() {
    state.flashMessage = "";
    state.flashTimeoutId = null;

    const flashBanner = document.querySelector(".flash-banner");
    if (flashBanner) {
      flashBanner.remove();
    }
  }

  function showFlashMessage(message) {
    state.flashMessage = message;
    render();

    if (state.flashTimeoutId) {
      window.clearTimeout(state.flashTimeoutId);
    }

    state.flashTimeoutId = window.setTimeout(dismissFlashMessage, 3200);
  }

  function validateDraft(draft) {
    const errors = {};

    if (!draft.subject.trim()) {
      errors.subject = "Subject is required.";
    }

    if (!draft.date || Number.isNaN(Date.parse(draft.date))) {
      errors.date = "Choose a valid study date.";
    }

    if (!Number.isFinite(Number(draft.durationMinutes)) || Number(draft.durationMinutes) <= 0) {
      errors.durationMinutes = "Duration must be greater than zero.";
    }

    return errors;
  }

  function setDraftFromSession(session) {
    state.draft = {
      subject: session.subject,
      assignment: session.assignment || "",
      assignmentType: session.assignmentType || "",
      assignmentGradePercent:
        session.assignmentGradePercent === "" || session.assignmentGradePercent === undefined
          ? ""
          : session.assignmentGradePercent,
      assignmentWeightPercent:
        session.assignmentWeightPercent === "" || session.assignmentWeightPercent === undefined
          ? ""
          : session.assignmentWeightPercent,
      linkedClassGradeId: session.linkedClassGradeId || "",
      date: session.date.slice(0, 10),
      durationMinutes: session.durationMinutes,
      notes: session.notes || "",
      category: session.category || "",
    };
  }

  function readSessionDraftFromForm(form) {
    const formData = new FormData(form);

    return {
      subject: String(formData.get("subject") || ""),
      assignment: String(formData.get("assignment") || ""),
      assignmentType: String(formData.get("assignmentType") || "").trim().toLowerCase(),
      assignmentGradePercent: String(formData.get("assignmentGradePercent") || "").trim(),
      assignmentWeightPercent: String(formData.get("assignmentWeightPercent") || "").trim(),
      linkedClassGradeId: state.draft.linkedClassGradeId || "",
      date: String(formData.get("date") || ""),
      durationMinutes: String(formData.get("durationMinutes") || ""),
      notes: String(formData.get("notes") || ""),
      category: String(formData.get("category") || ""),
    };
  }

  function resetForm() {
    state.draft = blankDraft();
    state.errors = {};
    state.editingId = null;
  }

  function deleteClassBySubject(subject) {
    state.sessions = state.sessions.filter(function (session) {
      return session.subject !== subject;
    });

    state.grades = state.grades.filter(function (grade) {
      return grade.subject !== subject;
    });

    state.classCatalog = state.classCatalog.filter(function (entry) {
      return entry.name !== subject;
    });

    state.classGradebooks = Object.keys(state.classGradebooks).reduce(function (next, key) {
      if (key !== subject) {
        next[key] = state.classGradebooks[key];
      }
      return next;
    }, {});

    if (state.editingClassGrade && state.editingClassGrade.subject === subject) {
      state.editingClassGrade = null;
    }

    if (state.editingId) {
      const editingSession = state.sessions.find(function (session) {
        return session.id === state.editingId;
      });
      if (!editingSession) {
        resetForm();
      }
    }

    if (state.selectedSubject === subject) {
      state.selectedSubject = "all";
    }

    if (state.gradeChartClass === subject) {
      state.gradeChartClass = "all";
    }

    state.selectedClass = null;
    state.currentPage = "classes";

    persist();
    saveGrades(state.grades);
    saveClassGradebooks(state.classGradebooks);
    saveClassCatalog(state.classCatalog);
  }


  function saveCurrentUserProfile(updates) {
    if (!state.currentUser) {
      return;
    }

    const updatedUser = {
      ...state.currentUser,
      ...updates,
    };
    const accounts = loadAccounts().map(function (account) {
      return account.id === updatedUser.id ? updatedUser : account;
    });
    saveAccounts(accounts);
    setActiveUser(updatedUser);
    state.currentUser = updatedUser;
  }

  function saveClassFromForm(form, includeSchool) {
    const formData = new FormData(form);
    const school = String(formData.get("school") || "").trim();
    const className = String(formData.get("className") || "").trim();
    const classCode = String(formData.get("classCode") || "").trim().toUpperCase();
    const errors = {};

    if (includeSchool && !school && !(state.currentUser && state.currentUser.school)) {
      errors.school = "Add your school first.";
    }

    if (!className) {
      errors.name = "Enter the class name.";
    }

    if (!classCode) {
      errors.code = "Enter the class code, like MTH 131.";
    }

    state.classDraft = { name: className, code: classCode };
    state.classErrors = errors;

    if (Object.keys(errors).length > 0) {
      render();
      return false;
    }

    if (includeSchool && school) {
      saveCurrentUserProfile({ school: school });
    }

    const existingIndex = state.classCatalog.findIndex(function (entry) {
      return entry.name.toLowerCase() === className.toLowerCase() || entry.code.toLowerCase() === classCode.toLowerCase();
    });
    const classEntry = {
      id: existingIndex >= 0 ? state.classCatalog[existingIndex].id : generateId(),
      name: className,
      code: classCode,
      createdAt: existingIndex >= 0 ? state.classCatalog[existingIndex].createdAt : new Date().toISOString(),
    };

    state.classCatalog = existingIndex >= 0
      ? state.classCatalog.map(function (entry, index) { return index === existingIndex ? classEntry : entry; })
      : state.classCatalog.concat(classEntry);

    if (!state.classGradebooks[className]) {
      state.classGradebooks = {
        ...state.classGradebooks,
        [className]: [],
      };
      saveClassGradebooks(state.classGradebooks);
    }

    saveClassCatalog(state.classCatalog);
    state.classDraft = { name: "", code: "" };
    state.classErrors = {};
    return true;
  }

  function persist() {
    saveSessions(state.sessions);
  }

  function navigateToPage(pageKey) {
    const nextPage = VALID_PAGE_KEYS.has(pageKey) ? pageKey : "home";

    state.currentPage = nextPage;

    if (nextPage !== "classes") {
      state.selectedClass = null;
    }

    render();
  }

  // MAIN RENDER FUNCTION
  // Whenever state changes, this function rebuilds the current page.
  // Main render function. Rebuilds the currently selected page from app state.
  function render() {
    if (!state.currentUser) {
      state.currentUser = DEMO_USER;
      setActiveUser(DEMO_USER);
      reloadAccountData();
    }

    const isEditing = Boolean(state.editingId);
    let pageContent = "";

    if (state.currentPage === "home") {
      pageContent = renderHomePage(state.sessions, state.timer);
    } else if (state.currentPage === "sessions") {
      pageContent = renderSessionsPage(
        state.draft,
        state.errors,
        isEditing,
        state.sessions,
        state.editingId,
        state.sessionSort
      );
    } else if (state.currentPage === "classes") {
      pageContent = renderClassesPage(
        state.sessions,
        state.grades,
        state.classGradebooks,
        state.selectedClass
      );
    } else if (state.currentPage === "analytics") {
      pageContent = renderAnalyticsPage(
        state.sessions,
        state.selectedSubject,
        state.chartWeeks,
        state.selectedWeekKey,
        state.chartMode,
        state.selectedDayKey
      );
    } else if (state.currentPage === "stats") {
      pageContent = renderStatsPage(state.sessions);
    } else if (state.currentPage === "security") {
      pageContent = renderSecurityPage(state.security, state.currentUser);
    } else {
      pageContent = renderCalendarPage(state.calendar, state.sessions);
    }

    appRoot.innerHTML = `
      <main class="page-shell" data-page="${escapeHtml(state.currentPage)}">
        ${renderNavigation(state.currentPage, state.currentUser)}
        <section class="hero hero-shell" data-page="${escapeHtml(state.currentPage)}">
          ${pageContent}
        </section>
      </main>
    `;
  }

  // EVENT HANDLERS
  // handleSubmit() manages all forms in the app.
  // Shared submit handler for every form in the app.
  async function handleSubmit(form, event) {
    event.preventDefault();

    if (form.id === "auth-form") {
      const formData = new FormData(form);
      const mode = String(formData.get("mode") || "login");
      const input = {
        name: String(formData.get("name") || "").trim(),
        school: String(formData.get("school") || "").trim(),
        email: normalizeEmail(formData.get("email")),
        password: String(formData.get("password") || ""),
      };

      state.authDraft = { name: input.name, school: input.school, email: input.email, password: "" };
      state.authMode = mode === "signup" ? "signup" : "login";
      state.authErrors = validateAuthFields(input, state.authMode);

      if (Object.keys(state.authErrors).length > 0) {
        render();
        return;
      }

      const accounts = loadAccounts();
      const existing = accounts.find(function (account) {
        return account.email === input.email;
      });

      if (state.authMode === "signup") {
        if (existing && window.location.protocol === "file:") {
          state.authErrors = { email: "An account with this email already exists on this browser." };
          render();
          return;
        }

        try {
          await callAuthApi("/api/auth/signup", {
            name: input.name,
            full_name: input.name,
            school: input.school,
            email: input.email,
            password: input.password,
          });
        } catch (error) {
          state.authErrors = { form: error.message || "Could not create your secure account." };
          render();
          return;
        }

        const salt = generateSalt();
        const now = new Date().toISOString();
        const account = {
          id: authResult && authResult.user && authResult.user.id ? authResult.user.id : generateId(),
          name: input.name,
          email: input.email,
          school: input.school,
          passwordHash: await hashPassword(input.password, salt),
          salt: salt,
          createdAt: now,
          lastLoginAt: now,
        };

        const nextAccounts = accounts.filter(function (savedAccount) {
          return savedAccount.email !== account.email && savedAccount.id !== account.id;
        }).concat(account);
        saveAccounts(nextAccounts);
        await syncAccountFile(account);
        setActiveUser(account);
        copyLegacyStorageToAccount(account.id);
        state.currentUser = account;
        state.authErrors = {};
        state.authDraft = { name: "", school: "", email: "", password: "" };
        reloadAccountData();
        showFlashMessage(`Welcome to AcademicTILT, ${account.name}. Your secure account workspace is ready.`);
        return;
      }

      if (!existing || existing.passwordHash !== await hashPassword(input.password, existing.salt)) {
        state.authErrors = { form: "Email or password did not match an account." };
        render();
        return;
      }

      try {
        await callAuthApi("/api/auth/login", { email: input.email, password: input.password });
      } catch (error) {
        state.authErrors = { form: error.message || "Could not start a secure session." };
        render();
        return;
      }

      const serverUser = authResult && authResult.user ? authResult.user : null;
      const salt = existing ? existing.salt : generateSalt();
      const updatedAccount = {
        id: serverUser && serverUser.id ? serverUser.id : existing.id,
        name: serverUser && serverUser.full_name ? serverUser.full_name : (existing && existing.name) || "Student",
        email: serverUser && serverUser.email ? serverUser.email : existing.email,
        school: (existing && existing.school) || "",
        passwordHash: existing ? existing.passwordHash : await hashPassword(input.password, salt),
        salt: salt,
        createdAt: (existing && existing.createdAt) || (serverUser && serverUser.created_at) || new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
      };
      saveAccounts(accounts.filter(function (account) {
        return account.email !== updatedAccount.email && account.id !== updatedAccount.id;
      }).concat(updatedAccount));
      await syncAccountFile(updatedAccount);
      setActiveUser(updatedAccount);
      copyLegacyStorageToAccount(updatedAccount.id);
      state.currentUser = updatedAccount;
      state.authErrors = {};
      state.authDraft = { name: "", school: "", email: "", password: "" };
      reloadAccountData();
      showFlashMessage(`Welcome back, ${updatedAccount.name}.`);
      return;
    }

    if (form.id === "profile-setup-form") {
      if (saveClassFromForm(form, true)) {
        showFlashMessage("School and class saved. You can now log sessions against your roster.");
      }
      return;
    }

    if (form.id === "class-catalog-form") {
      if (saveClassFromForm(form, false)) {
        showFlashMessage("Class saved with its class code.");
      }
      return;
    }

    if (form.id === "grade-form") {
      const formData = new FormData(form);
      const grade = {
        id: generateId(),
        subject: String(formData.get("subject") || "").trim(),
        examName: String(formData.get("examName") || "").trim(),
        examDate: String(formData.get("examDate") || ""),
        gradePercent: Number(formData.get("gradePercent") || 0),
        notes: String(formData.get("notes") || "").trim(),
      };

      if (!grade.subject || !grade.examName || !grade.examDate || !Number.isFinite(grade.gradePercent)) {
        return;
      }

      state.grades = [grade].concat(state.grades).sort(function (a, b) {
        return new Date(b.examDate) - new Date(a.examDate);
      });
      saveGrades(state.grades);
      render();
      return;
    }

    if (form.id === "class-grade-form") {
      const formData = new FormData(form);
      const subject = String(formData.get("subject") || "").trim();
      const editingId = String(formData.get("editingId") || "").trim();
      const entry = {
        id: editingId || generateId(),
        name: String(formData.get("name") || "").trim(),
        itemType: String(formData.get("itemType") || "assignment").trim().toLowerCase(),
        date: String(formData.get("date") || ""),
        gradePercent: Number(formData.get("gradePercent") || 0),
        weightPercent: Number(formData.get("weightPercent") || 0),
      };

      if (
        !subject ||
        !entry.name ||
        !entry.date ||
        !Number.isFinite(entry.gradePercent) ||
        !Number.isFinite(entry.weightPercent)
      ) {
        return;
      }

      const existing = state.classGradebooks[subject] || [];
      state.classGradebooks = {
        ...state.classGradebooks,
        [subject]: editingId
          ? existing.map(function (item) {
              return item.id === editingId ? entry : item;
            })
          : existing.concat(entry),
      };
      saveClassGradebooks(state.classGradebooks);
      state.currentPage = "classes";
      state.selectedClass = subject;
      state.editingClassGrade = null;
      showFlashMessage(
        editingId
          ? `Disciplined refinement matters. ${entry.name} was updated in ${subject}.`
          : `Productive detail work matters. ${entry.name} was added to ${subject}.`
      );
      return;
    }

    const formData = new FormData(form);
    const draft = {
      subject: String(formData.get("subject") || ""),
      assignment: String(formData.get("assignment") || ""),
      assignmentType: String(formData.get("assignmentType") || "").trim().toLowerCase(),
      assignmentGradePercent: String(formData.get("assignmentGradePercent") || "").trim(),
      assignmentWeightPercent: String(formData.get("assignmentWeightPercent") || "").trim(),
      linkedClassGradeId: state.draft.linkedClassGradeId || "",
      date: String(formData.get("date") || ""),
      durationMinutes: Number(formData.get("durationMinutes") || 0),
      notes: String(formData.get("notes") || ""),
      category: String(formData.get("category") || ""),
    };

    if (!draft.assignmentType) {
      draft.assignment = "";
      draft.assignmentGradePercent = "";
      draft.assignmentWeightPercent = "";
    }

    const errors = validateDraft(draft);
    state.draft = draft;
    state.errors = errors;

    if (Object.keys(errors).length > 0) {
      render();
      return;
    }

    const existingSession = state.editingId
      ? state.sessions.find(function (session) {
          return session.id === state.editingId;
        }) || null
      : null;

    const syncResult = syncSessionAssignmentToClassGradebooks(existingSession, draft);
    state.classGradebooks = syncResult.gradebooks;
    saveClassGradebooks(state.classGradebooks);
    draft.linkedClassGradeId = syncResult.linkedClassGradeId;

    if (state.editingId) {
      state.sessions = state.sessions.map(function (session) {
        return session.id === state.editingId ? updateSession(session, draft) : session;
      });
      showFlashMessage(`Disciplined work includes refining the details. Your ${draft.subject} session was updated.`);
    } else {
      const createdSession = createSession(draft);
      state.sessions = [createdSession].concat(state.sessions);
      showFlashMessage(getEncouragementMessage(createdSession));
    }

    state.sessions.sort(function (a, b) {
      return new Date(b.date) - new Date(a.date);
    });
    persist();
    resetForm();
    render();
  }

  // handleClick() manages all buttons/links that use data-action attributes.
  // Shared click handler for all interactive buttons using data-action attributes.
  function handleClick(event) {
    const target = event.target.closest("[data-action]");
    if (!target) {
      return;
    }

    const action = target.dataset.action;
    const id = target.dataset.id;
    const subject = target.dataset.subject;

    if (action === "switch-auth" && target.dataset.mode) {
      state.authMode = target.dataset.mode === "signup" ? "signup" : "login";
      state.authErrors = {};
      state.authDraft = { name: "", school: "", email: state.authDraft.email || "", password: "" };
      render();
      return;
    }

    if (action === "logout") {
      return;
    }

    if ((action === "navigate" || action === "open-calendar") && target.dataset.page) {
      state.currentPage = target.dataset.page;
      if (target.dataset.page !== "classes") {
        state.selectedClass = null;
      }
      render();
      if (target.dataset.page === "calendar") {
        requestCalendarStatus();
      }
      if (target.dataset.page === "security") {
        requestSecurityStatus();
      }
      return;
    }

    if (action === "refresh-security-status") {
      requestSecurityStatus();
      return;
    }

    if (action === "go-classes") {
      state.currentPage = "classes";
      state.selectedClass = null;
      render();
      return;
    }

    if (action === "analytics-tab" && target.dataset.tab) {
      state.analyticsTab = target.dataset.tab;
      state.currentPage = "analytics";
      render();
      return;
    }

    if (action === "toggle-timer") {
      state.timer.isRunning = !state.timer.isRunning;
      render();
      return;
    }

    if (action === "reset-timer") {
      state.timer.elapsedSeconds = 0;
      state.timer.isRunning = false;
      render();
      return;
    }

    if (action === "generate-ai-coach") {
      requestAiCoach();
      return;
    }

    if (action === "generate-ai-plan") {
      requestAiPlan();
      return;
    }

    if (action === "connect-google-calendar") {
      connectGoogleCalendar();
      return;
    }

    if (action === "refresh-google-calendar-status") {
      requestCalendarStatus();
      return;
    }

    if (action === "sync-google-calendar") {
      syncGoogleCalendarSessions();
      return;
    }

    if (action === "delete-grade" && id) {
      state.grades = state.grades.filter(function (grade) {
        return grade.id !== id;
      });
      saveGrades(state.grades);
      render();
      return;
    }

    if (action === "open-class" && target.dataset.subject) {
      state.currentPage = "classes";
      state.selectedClass = target.dataset.subject;
      render();
      return;
    }

    if (action === "back-to-classes") {
      state.currentPage = "classes";
      state.selectedClass = null;
      state.editingClassGrade = null;
      render();
      return;
    }

    if (action === "delete-class" && target.dataset.subject) {
      const subjectName = target.dataset.subject;
      const shouldDelete = window.confirm(
        `Delete ${subjectName} and all of its sessions, grade comparisons, and class assignments? This cannot be undone.`
      );

      if (!shouldDelete) {
        return;
      }

      deleteClassBySubject(subjectName);
      render();
      showFlashMessage(`${subjectName} was deleted from your classes.`);
      return;
    }

    if (action === "cancel-class-grade-edit") {
      state.editingClassGrade = null;
      render();
      return;
    }

    if (action === "edit-class-grade" && id && target.dataset.subject) {
      const subjectName = target.dataset.subject;
      const existing = state.classGradebooks[subjectName] || [];
      const match = existing.find(function (entry) {
        return entry.id === id;
      });

      if (!match) {
        return;
      }

      state.currentPage = "classes";
      state.selectedClass = subjectName;
      state.editingClassGrade = {
        subject: subjectName,
        id: match.id,
        name: match.name,
        itemType: match.itemType || "assignment",
        date: match.date || "",
        gradePercent: match.gradePercent,
        weightPercent: match.weightPercent,
      };
      render();
      return;
    }

    if (action === "delete-class-grade" && id && target.dataset.subject) {
      const subjectName = target.dataset.subject;
      const existing = state.classGradebooks[subjectName] || [];
      state.classGradebooks = {
        ...state.classGradebooks,
        [subjectName]: existing.filter(function (entry) {
          return entry.id !== id;
        }),
      };
      saveClassGradebooks(state.classGradebooks);
      if (state.editingClassGrade && state.editingClassGrade.id === id) {
        state.editingClassGrade = null;
      }
      render();
      return;
    }

    if (action === "filter-subject" && subject) {
      state.selectedSubject = subject;
      state.currentPage = "analytics";
      render();
      return;
    }

    if (action === "cancel-edit") {
      resetForm();
      render();
      return;
    }

    if (action === "filter-range" && target.dataset.range) {
      state.chartMode = "range";
      state.chartWeeks = Number(target.dataset.range) || 6;
      state.selectedWeekKey = null;
      state.selectedDayKey = null;
      state.currentPage = "analytics";
      render();
      return;
    }

    if (action === "jump-current-week") {
      const today = new Date();
      const day = today.getDay();
      if (day === 0) {
        today.setDate(today.getDate() - 2);
      } else if (day === 6) {
        today.setDate(today.getDate() - 1);
      }
      state.chartMode = "week-breakdown";
      state.selectedWeekKey = getWeekStart(today).toISOString().slice(0, 10);
      state.selectedDayKey = today.toISOString().slice(0, 10);
      state.currentPage = "analytics";
      render();
      return;
    }

    if (action === "select-week" && target.dataset.week) {
      const weekStart = target.dataset.week;
      const monday = new Date(weekStart + "T00:00:00");
      state.chartMode = "week-breakdown";
      state.selectedWeekKey = weekStart;
      state.selectedDayKey = monday.toISOString().slice(0, 10);
      state.currentPage = "analytics";
      render();
      return;
    }

    if (action === "select-day" && target.dataset.week) {
      state.selectedDayKey = target.dataset.week;
      state.currentPage = "analytics";
      render();
      return;
    }

    if (!id) {
      return;
    }

    if (action === "edit") {
      const session = state.sessions.find(function (entry) {
        return entry.id === id;
      });

      if (!session) {
        return;
      }

      state.editingId = id;
      state.errors = {};
      state.currentPage = "sessions";
      setDraftFromSession(session);
      render();
      window.requestAnimationFrame(function () {
        const formPanel = document.querySelector(".form-panel");
        const subjectInput = document.querySelector('input[name="subject"]');
        if (formPanel) {
          formPanel.scrollIntoView({ behavior: "smooth", block: "start" });
          formPanel.classList.add("editing-pulse");
          window.setTimeout(function () {
            formPanel.classList.remove("editing-pulse");
          }, 1200);
        }
        if (subjectInput) {
          subjectInput.focus();
        }
      });
      return;
    }

    if (action === "delete") {
      state.sessions = state.sessions.filter(function (entry) {
        return entry.id !== id;
      });
      persist();

      if (state.editingId === id) {
        resetForm();
      }

      render();
    }
  }

  // STARTUP / EVENT WIRING
  // These listeners connect the rendered HTML back to the JavaScript logic.
  const handledFormIds = new Set([
    "auth-form",
    "profile-setup-form",
    "class-catalog-form",
    "session-form",
    "grade-form",
    "class-grade-form",
  ]);

  appRoot.addEventListener("submit", function (event) {
    const form = event.target;

    if (!(form instanceof HTMLFormElement) || !handledFormIds.has(form.id)) {
      return;
    }

    handleSubmit(form, event);
  });

  appRoot.addEventListener("click", handleClick);

  appRoot.addEventListener("change", function (event) {
    const target = event.target;
    if (
      target instanceof HTMLSelectElement &&
      target.name === "assignmentType" &&
      target.form &&
      target.form.id === "session-form"
    ) {
      state.draft = readSessionDraftFromForm(target.form);

      if (!state.draft.assignmentType) {
        state.draft.assignment = "";
        state.draft.assignmentGradePercent = "";
        state.draft.assignmentWeightPercent = "";
      }

      render();
      return;
    }

    if (target instanceof HTMLSelectElement && target.dataset.action === "sort-sessions") {
      state.sessionSort = target.value || "date-desc";
      render();
      return;
    }

    if (target instanceof HTMLSelectElement && target.dataset.action === "grade-chart-class") {
      state.gradeChartClass = target.value || "all";
      state.analyticsTab = "grade-study";
      state.currentPage = "analytics";
      render();
      return;
    }

    if (target instanceof HTMLSelectElement && target.dataset.action === "grade-chart-threshold") {
      state.gradeChartThreshold = Number(target.value || 0);
      state.analyticsTab = "grade-study";
      state.currentPage = "analytics";
      render();
      return;
    }

    if (target instanceof HTMLSelectElement && target.dataset.action === "grade-chart-weeks") {
      state.gradeChartWeeks = Number(target.value || 12);
      state.analyticsTab = "grade-study";
      state.currentPage = "analytics";
      render();
    }
  });

  window.setInterval(function () {
    if (!state.timer.isRunning) {
      return;
    }

    state.timer.elapsedSeconds += 1;
    const timerDisplay = document.querySelector("#timer-display");
    if (timerDisplay) {
      timerDisplay.textContent = formatClock(state.timer.elapsedSeconds);
    }
  }, 1000);

  handleCalendarRedirectMessage();
  render();
  if (state.currentPage === "calendar" && state.currentUser) {
    requestCalendarStatus();
  }

  if (state.currentPage === "security" && state.currentUser) {
    requestSecurityStatus();
  }
  document.title = "AcademicTILT";
})();
