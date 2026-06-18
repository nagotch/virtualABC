package contest

import (
	"sort"
	"time"

	"github.com/nagotch/virtualABC/internal/atcoder"
)

const penaltySeconds = 300 // 5分

type Status string

const (
	StatusActive Status = "active"
	StatusEnded  Status = "ended"
)

type Problem struct {
	ID    string
	Index string
	Title string
	Score int
}

type ProblemResult struct {
	ProblemID string
	ACTime    *time.Time
	WACount   int
	Score     int
	TimeSecs  int
}

type Participant struct {
	TraQID    string
	AtCoderID string
	Results   map[string]*ProblemResult
}

func (p *Participant) TotalScore() int {
	total := 0
	for _, r := range p.Results {
		total += r.Score
	}
	return total
}

func (p *Participant) TotalPenalty() int {
	total := 0
	for _, r := range p.Results {
		if r.ACTime != nil {
			total += r.TimeSecs + r.WACount*penaltySeconds
		}
	}
	return total
}

type Contest struct {
	ID           string
	ChannelID    string
	ContestID    string
	StartTime    time.Time
	Duration     time.Duration
	Problems     []Problem
	Participants map[string]*Participant
	Status       Status
	CreatorID    string
}

func (c *Contest) EndTime() time.Time {
	return c.StartTime.Add(c.Duration)
}

func indexToScore(index string) int {
	scores := map[string]int{
		"A": 100, "B": 200, "C": 300,
		"D": 400, "E": 500, "F": 600, "G": 625,
	}
	if s, ok := scores[index]; ok {
		return s
	}
	return 100
}

type Standing struct {
	Rank      int
	TraQID    string
	AtCoderID string
	Score     int
	Penalty   int
	Results   map[string]*ProblemResult
}

func (c *Contest) GetStandings() []Standing {
	var standings []Standing
	for _, p := range c.Participants {
		standings = append(standings, Standing{
			TraQID:    p.TraQID,
			AtCoderID: p.AtCoderID,
			Score:     p.TotalScore(),
			Penalty:   p.TotalPenalty(),
			Results:   p.Results,
		})
	}

	sort.Slice(standings, func(i, j int) bool {
		if standings[i].Score != standings[j].Score {
			return standings[i].Score > standings[j].Score
		}
		return standings[i].Penalty < standings[j].Penalty
	})

	for i := range standings {
		standings[i].Rank = i + 1
	}
	return standings
}

func (c *Contest) UpdateSubmissions(atcoderID, traqID string, submissions []atcoder.Submission) {
	p, ok := c.Participants[traqID]
	if !ok {
		return
	}

	problemMap := make(map[string]Problem, len(c.Problems))
	for _, prob := range c.Problems {
		problemMap[prob.ID] = prob
	}

	for _, sub := range submissions {
		prob, ok := problemMap[sub.ProblemID]
		if !ok {
			continue
		}

		subTime := time.Unix(sub.EpochSecond, 0)
		if subTime.Before(c.StartTime) || subTime.After(c.EndTime()) {
			continue
		}

		result, exists := p.Results[sub.ProblemID]
		if !exists {
			result = &ProblemResult{ProblemID: sub.ProblemID}
			p.Results[sub.ProblemID] = result
		}

		if result.ACTime != nil {
			continue
		}

		if sub.Result == "AC" {
			acTime := subTime
			result.ACTime = &acTime
			result.Score = prob.Score
			result.TimeSecs = int(subTime.Sub(c.StartTime).Seconds())
		} else {
			result.WACount++
		}
	}
}
