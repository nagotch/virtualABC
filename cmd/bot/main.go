package main

import (
	"log"
	"os"
	"time"

	traq "github.com/traPtitech/go-traq"
	traqbot "github.com/traPtitech/traq-bot"

	"github.com/nagotch/virtualABC/bot"
	"github.com/nagotch/virtualABC/internal/atcoder"
	"github.com/nagotch/virtualABC/internal/contest"
	"github.com/nagotch/virtualABC/internal/store"
)

func main() {
	verificationToken := os.Getenv("VERIFICATION_TOKEN")
	if verificationToken == "" {
		log.Fatal("VERIFICATION_TOKEN is not set")
	}

	accessToken := os.Getenv("BOT_ACCESS_TOKEN")
	if accessToken == "" {
		log.Fatal("BOT_ACCESS_TOKEN is not set")
	}

	botName := os.Getenv("BOT_NAME")
	if botName == "" {
		botName = "BOT_virtualABC"
	}

	addr := os.Getenv("ADDR")
	if addr == "" {
		addr = ":8080"
	}

	if err := os.MkdirAll("data", 0755); err != nil {
		log.Fatal("failed to create data directory:", err)
	}

	s, err := store.New("data/users.json")
	if err != nil {
		log.Fatal("failed to initialize store:", err)
	}

	// traQ API client for sending messages (uses Bearer token)
	cfg := traq.NewConfiguration()
	cfg.AddDefaultHeader("Authorization", "Bearer "+accessToken)
	apiClient := traq.NewAPIClient(cfg)

	ac := atcoder.NewClient()
	manager := contest.NewManager(ac)

	h := bot.New(apiClient, manager, s, botName)

	handlers := traqbot.EventHandlers{}
	handlers.SetMessageCreatedHandler(h.OnMessageCreated)

	// Poll AtCoder API every 60 seconds to update standings
	go func() {
		ticker := time.NewTicker(60 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			manager.UpdateAllSubmissions()
		}
	}()

	server := traqbot.NewBotServer(verificationToken, handlers)
	log.Printf("Virtual ABC Bot starting on %s ...", addr)
	log.Fatal(server.ListenAndServe(addr))
}
