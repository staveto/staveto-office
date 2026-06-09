"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  ChevronDown,
  ChevronUp,
  ImageIcon,
  Loader2,
  MessageCircle,
  Minus,
  Send,
  SquarePen,
  User,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/i18n/I18nContext";
import { useAuth } from "@/context/AuthContext";
import { useBusinessChatAccess } from "@/hooks/useBusinessChatAccess";
import { cn } from "@/lib/utils";
import { BusinessChatComposePanel } from "@/components/business-chat/BusinessChatComposePanel";
import {
  ensureDirectChat,
  ensureGeneralChat,
  getOtherParticipantUid,
  getUnreadChatCount,
  listenBusinessChats,
  listenChatMessages,
  markChatRead,
  sendImageMessage,
  sendTextMessage,
  type BusinessChatDoc,
  type BusinessChatMessageDoc,
} from "@/services/business/businessChatService";
import {
  listChatTeamMembers,
  type ChatTeamMember,
} from "@/services/business/businessChatTeamService";
import { formatChatListTime, formatMessageTime } from "@/services/business/businessChatUtils";

type DrawerView = "collapsed" | "list" | "thread" | "compose";

function userInitials(name: string | null | undefined, email: string | null | undefined): string {
  const src = (name || email || "?").trim();
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

function resolveChatTitle(
  chat: BusinessChatDoc,
  currentUid: string,
  t: (key: string) => string,
  memberNames: Map<string, string>
): string {
  if (chat.type === "general") return t("business.chat.generalTitle");
  const otherUid = getOtherParticipantUid(chat, currentUid);
  if (otherUid && memberNames.has(otherUid)) return memberNames.get(otherUid)!;
  return chat.title || t("business.chat.directTitle");
}

export function BusinessMessagingDrawer() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { orgId, canAccessBusinessChat, canWriteChat } = useBusinessChatAccess();

  const [view, setView] = useState<DrawerView>("collapsed");
  const [chats, setChats] = useState<BusinessChatDoc[]>([]);
  const [loadingChats, setLoadingChats] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [memberNames, setMemberNames] = useState<Map<string, string>>(new Map());

  const [activeChat, setActiveChat] = useState<BusinessChatDoc | null>(null);
  const [messages, setMessages] = useState<BusinessChatMessageDoc[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [openingChat, setOpeningChat] = useState(false);
  const [teamMembers, setTeamMembers] = useState<ChatTeamMember[]>([]);
  const [loadingTeam, setLoadingTeam] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uid = user?.id ?? "";

  const refreshUnread = useCallback(async () => {
    if (!orgId || !uid) {
      setUnreadTotal(0);
      return;
    }
    try {
      const count = await getUnreadChatCount(orgId, uid);
      setUnreadTotal(count);
    } catch {
      setUnreadTotal(0);
    }
  }, [orgId, uid]);

  useEffect(() => {
    if (!canAccessBusinessChat || !orgId || !uid) return;

    let cancelled = false;
    let unsub: (() => void) | undefined;
    setLoadingChats(true);
    setChatError(null);

    void ensureGeneralChat(orgId).catch(() => {
      /* Best effort — listener may still work if general chat already exists. */
    });

    unsub = listenBusinessChats(
          orgId,
          uid,
          (rows) => {
            if (cancelled) return;
            setChats(rows);
            setLoadingChats(false);
            void refreshUnread();
          },
          (err) => {
            if (cancelled) return;
            const raw = err.message || "";
            setChatError(
              raw.includes("permission-denied") || raw.includes("PERMISSION_DENIED")
                ? t("business.chat.permissionDeniedFriendly")
                : raw || t("business.chat.error")
            );
            setLoadingChats(false);
          }
        );

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [canAccessBusinessChat, orgId, uid, refreshUnread, t]);

  useEffect(() => {
    if (!canAccessBusinessChat || !orgId || !uid) return;

    let cancelled = false;
    setLoadingTeam(true);
    listChatTeamMembers(orgId, uid)
      .then((rows) => {
        if (cancelled) return;
        setTeamMembers(rows);
        setMemberNames((prev) => {
          const next = new Map(prev);
          for (const m of rows) next.set(m.uid, m.displayName);
          return next;
        });
        setLoadingTeam(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadingTeam(false);
      });

    return () => {
      cancelled = true;
    };
  }, [canAccessBusinessChat, orgId, uid]);

  useEffect(() => {
    if (view !== "thread" || !orgId || !activeChat) return;

    let cancelled = false;
    setLoadingMessages(true);
    setMessageError(null);

    const unsub = listenChatMessages(
      orgId,
      activeChat.id,
      (rows) => {
        if (cancelled) return;
        setMessages(rows.filter((m) => !m.deletedAt));
        setLoadingMessages(false);
        void markChatRead({ orgId, chatId: activeChat.id }).then(() => refreshUnread());
      },
      (err) => {
        if (cancelled) return;
        setMessageError(err.message || t("business.chat.error"));
        setLoadingMessages(false);
      }
    );

    return () => {
      cancelled = true;
      unsub();
    };
  }, [view, orgId, activeChat, refreshUnread, t]);

  useEffect(() => {
    if (view === "thread") {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, view]);

  const listRows: BusinessChatDoc[] = useMemo(() => {
    if (chats.length > 0) return chats;
    if (!orgId) return [];
    return [
      {
        id: "general",
        orgId,
        type: "general",
        title: t("business.chat.generalTitle"),
        createdAt: null,
        updatedAt: null,
        lastMessageText: "",
        lastMessageAt: null,
        lastMessageByUid: null,
      },
    ];
  }, [chats, orgId, t]);

  if (!canAccessBusinessChat || !orgId) return null;

  const openThread = (chat: BusinessChatDoc) => {
    setActiveChat(chat);
    setView("thread");
    setMessageError(null);
  };

  const handleSelectMember = async (member: ChatTeamMember) => {
    if (!orgId || openingChat) return;
    setOpeningChat(true);
    setMessageError(null);
    try {
      const chat = await ensureDirectChat({
        orgId,
        otherUid: member.uid,
        otherDisplayName: member.displayName,
      });
      setMemberNames((prev) => new Map(prev).set(member.uid, member.displayName));
      setActiveChat(chat);
      setView("thread");
    } catch (e) {
      setChatError(e instanceof Error ? e.message : t("business.chat.error"));
    } finally {
      setOpeningChat(false);
    }
  };

  const handleSend = async () => {
    if (!canWriteChat || !orgId || !activeChat || !input.trim() || sending) return;
    setSending(true);
    setMessageError(null);
    const text = input.trim();
    setInput("");
    try {
      await sendTextMessage({ orgId, chatId: activeChat.id, text });
      await markChatRead({ orgId, chatId: activeChat.id });
      await refreshUnread();
    } catch (e) {
      setMessageError(e instanceof Error ? e.message : t("business.chat.error"));
      setInput(text);
    } finally {
      setSending(false);
    }
  };

  const handlePhoto = async (file: File) => {
    if (!canWriteChat || !orgId || !activeChat) return;
    setUploadingPhoto(true);
    setMessageError(null);
    try {
      await sendImageMessage({ orgId, chatId: activeChat.id, file, mimeType: file.type });
      await markChatRead({ orgId, chatId: activeChat.id });
      await refreshUnread();
    } catch (e) {
      setMessageError(e instanceof Error ? e.message : t("business.chat.error"));
    } finally {
      setUploadingPhoto(false);
    }
  };

  const activeChatTitle = activeChat
    ? resolveChatTitle(activeChat, uid, t, memberNames)
    : t("business.chat.title");

  const panelWidth = "w-[360px]";

  if (view === "collapsed") {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <button
          type="button"
          onClick={() => setView("list")}
          className="flex items-center gap-3 rounded-full border border-[#E2E8F0] bg-white px-4 py-2.5 shadow-[0_8px_30px_rgba(15,42,77,0.15)] hover:shadow-[0_12px_36px_rgba(15,42,77,0.2)] transition-shadow"
        >
          <div className="relative">
            <div className="flex size-9 items-center justify-center rounded-full bg-[#1D376A] text-xs font-bold text-white">
              {userInitials(user?.name, user?.email)}
            </div>
            {unreadTotal > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-[#EA580C] px-1 text-[10px] font-bold text-white flex items-center justify-center">
                {unreadTotal > 99 ? "99+" : unreadTotal}
              </span>
            )}
          </div>
          <span className="text-sm font-semibold text-[#0F172A]">{t("business.chat.title")}</span>
          <ChevronUp className="size-4 text-muted-foreground" />
        </button>
      </div>
    );
  }

  return (
    <div className={cn("fixed bottom-4 right-4 z-50 flex flex-col", panelWidth)}>
      <div className="relative flex flex-col overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-[0_12px_40px_rgba(15,42,77,0.18)] max-h-[min(640px,calc(100vh-2rem))]">
        {view === "compose" && (
          <BusinessChatComposePanel
            orgId={orgId}
            currentUid={uid}
            initialMembers={teamMembers}
            onClose={() => setView("list")}
            onSelectMember={(member) => void handleSelectMember(member)}
          />
        )}

        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E2E8F0] px-4 py-3 bg-[#FAFBFC]">
          <div className="flex items-center gap-2 min-w-0">
            {view === "thread" && (
              <button
                type="button"
                className="text-sm font-medium text-[#1D376A] hover:underline shrink-0"
                onClick={() => {
                  setView("list");
                  setActiveChat(null);
                }}
              >
                ←
              </button>
            )}
            <h2 className="text-sm font-semibold text-[#0F172A] truncate">
              {view === "thread" ? activeChatTitle : t("business.chat.title")}
            </h2>
          </div>
          <div className="flex items-center gap-1">
            {view === "list" && canWriteChat && (
              <button
                type="button"
                className="p-1.5 rounded-md hover:bg-[#EEF2F7] text-muted-foreground"
                onClick={() => setView("compose")}
                aria-label={t("business.chat.compose")}
              >
                <SquarePen className="size-4" />
              </button>
            )}
            <button
              type="button"
              className="p-1.5 rounded-md hover:bg-[#EEF2F7] text-muted-foreground"
              onClick={() => setView("collapsed")}
              aria-label={t("business.chat.minimize")}
            >
              <Minus className="size-4" />
            </button>
            <button
              type="button"
              className="p-1.5 rounded-md hover:bg-[#EEF2F7] text-muted-foreground"
              onClick={() => {
                setView("collapsed");
                setActiveChat(null);
              }}
              aria-label={t("business.chat.close")}
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* List view */}
        {view === "list" && (
          <div className="flex-1 overflow-y-auto min-h-[320px]">
            {loadingChats || openingChat ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{t("business.chat.loading")}</p>
              </div>
            ) : (
              <>
                {chatError && (
                  <p className="p-4 text-sm text-destructive border-b border-red-100 bg-red-50">{chatError}</p>
                )}

                {listRows.length > 0 && (
                  <ul>
                    {listRows.map((chat) => {
                      const title = resolveChatTitle(chat, uid, t, memberNames);
                      const isDirect = chat.type === "direct";
                      return (
                        <li key={chat.id}>
                          <button
                            type="button"
                            className="w-full flex items-start gap-3 px-4 py-3 hover:bg-[#F8FAFC] text-left border-b border-[#EEF2F7] transition-colors"
                            onClick={() => openThread(chat)}
                          >
                            <div
                              className={cn(
                                "flex size-10 shrink-0 items-center justify-center rounded-full",
                                isDirect ? "bg-[#1D376A] text-white text-xs font-bold" : "bg-[#EEF2FF] text-[#1D376A]"
                              )}
                            >
                              {isDirect ? (
                                userInitials(title, null)
                              ) : (
                                <MessageCircle className="size-5" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <p className="font-semibold text-sm text-[#0F172A] truncate">{title}</p>
                                <span className="text-[11px] text-muted-foreground shrink-0">
                                  {formatChatListTime(chat.lastMessageAt)}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground truncate mt-0.5">
                                {chat.lastMessageText || t("business.chat.noMessages")}
                              </p>
                            </div>
                            {chat.type === "general" && unreadTotal > 0 && (
                              <span className="min-w-[20px] h-5 rounded-full bg-[#EA580C] px-1.5 text-[10px] font-bold text-white flex items-center justify-center shrink-0">
                                {unreadTotal > 99 ? "99+" : unreadTotal}
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {canWriteChat && (
                  <div className="border-t border-[#EEF2F7]">
                    <p className="px-4 pt-3 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {t("business.chat.teamMembers")}
                    </p>
                    {loadingTeam ? (
                      <div className="flex justify-center py-6">
                        <Loader2 className="size-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : teamMembers.length === 0 ? (
                      <p className="px-4 pb-4 text-sm text-muted-foreground">{t("business.chat.noTeamMembers")}</p>
                    ) : (
                      <ul>
                        {teamMembers.map((member) => (
                          <li key={member.uid}>
                            <button
                              type="button"
                              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#F8FAFC] text-left transition-colors"
                              onClick={() => void handleSelectMember(member)}
                            >
                              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#1D376A] text-xs font-bold text-white">
                                {userInitials(member.displayName, member.email)}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-[#0F172A] truncate">{member.displayName}</p>
                                <p className="text-xs text-muted-foreground truncate">{t(member.roleLabelKey)}</p>
                              </div>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {!chatError && listRows.length === 0 && teamMembers.length === 0 && !loadingTeam && (
                  <p className="p-4 text-sm text-muted-foreground">{t("business.chat.empty")}</p>
                )}
              </>
            )}
          </div>
        )}

        {/* Thread view */}
        {view === "thread" && activeChat && (
          <>
            {activeChat.type === "direct" && (
              <div className="flex items-center gap-2 px-4 py-2 border-b border-[#EEF2F7] bg-white">
                <div className="flex size-8 items-center justify-center rounded-full bg-[#1D376A] text-[10px] font-bold text-white">
                  {userInitials(activeChatTitle, null)}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{activeChatTitle}</p>
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <User className="size-3" />
                    {t("business.chat.directSubtitle")}
                  </p>
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto min-h-[280px] max-h-[420px] px-3 py-3 space-y-3 bg-[#F4F7FA]">
              {loadingMessages ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="size-6 animate-spin text-muted-foreground" />
                </div>
              ) : messages.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">
                  {t("business.chat.noMessages")}
                </p>
              ) : (
                messages.map((msg) => {
                  const mine = msg.senderUid === uid;
                  const showSender = activeChat.type === "general" && !mine;
                  return (
                    <div
                      key={msg.id}
                      className={cn("flex flex-col max-w-[85%]", mine ? "ml-auto items-end" : "items-start")}
                    >
                      {showSender && (
                        <span className="text-[11px] text-muted-foreground mb-1 px-1 truncate max-w-full">
                          {msg.senderName || msg.senderEmail || "User"}
                        </span>
                      )}
                      <div
                        className={cn(
                          "rounded-2xl px-3 py-2 text-sm shadow-sm",
                          mine
                            ? "bg-[#EA580C] text-white rounded-br-md"
                            : "bg-white text-[#0F172A] border border-[#E2E8F0] rounded-bl-md"
                        )}
                      >
                        {msg.type === "image" && msg.imageUrl ? (
                          <a href={msg.imageUrl} target="_blank" rel="noopener noreferrer">
                            <Image
                              src={msg.imageUrl}
                              alt=""
                              width={220}
                              height={165}
                              className="rounded-lg max-h-[165px] w-auto object-cover"
                              unoptimized
                            />
                          </a>
                        ) : (
                          <span className="whitespace-pre-wrap break-words">{msg.text}</span>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground mt-0.5 px-1">
                        {formatMessageTime(msg.createdAt)}
                      </span>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {messageError && (
              <p className="px-3 py-1 text-xs text-destructive bg-red-50 border-t border-red-100">
                {messageError}
              </p>
            )}

            <div className="border-t border-[#E2E8F0] p-2 flex items-end gap-2 bg-white">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handlePhoto(file);
                  e.target.value = "";
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0 size-9"
                disabled={!canWriteChat || uploadingPhoto || sending}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploadingPhoto ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ImageIcon className="size-4" />
                )}
              </Button>
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={t("business.chat.inputPlaceholder")}
                className="min-h-9 text-sm"
                maxLength={1200}
                disabled={!canWriteChat || sending || uploadingPhoto}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleSend();
                  }
                }}
              />
              <Button
                type="button"
                size="icon"
                className="shrink-0 size-9 bg-[#EA580C] hover:bg-[#D94F1F]"
                disabled={!canWriteChat || !input.trim() || sending || uploadingPhoto}
                onClick={() => void handleSend()}
              >
                {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              </Button>
            </div>

            {!canWriteChat && (
              <p className="px-3 pb-2 text-[11px] text-muted-foreground">{t("business.chat.noAccessBody")}</p>
            )}
          </>
        )}
      </div>

      <button
        type="button"
        className="mt-2 self-end flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        onClick={() => setView("collapsed")}
      >
        <ChevronDown className="size-3" />
        {t("business.chat.minimize")}
      </button>
    </div>
  );
}
