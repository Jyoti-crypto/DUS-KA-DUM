from flask import Flask, render_template, request, jsonify, session
import random, math, heapq

app = Flask(__name__)
import os
app.secret_key = os.environ.get("SECRET_KEY", "dkd2_secret_2024")

QUESTIONS = [
    {"id":1,  "category":"Tech & Phones",  "q":"What percentage of students check their phone immediately after waking up?",          "ans":72},
    {"id":2,  "category":"Social Media",   "q":"What percentage of people watch reels or short videos before sleeping?",              "ans":64},
    {"id":3,  "category":"Food & Drinks",  "q":"What percentage of students drink coffee or tea daily?",                              "ans":58},
    {"id":4,  "category":"Shopping",       "q":"What percentage of people shop online at least once a month?",                        "ans":61},
    {"id":5,  "category":"Study Habits",   "q":"What percentage of students prefer studying at night over the morning?",              "ans":67},
    {"id":6,  "category":"Social Media",   "q":"What percentage of people post on Instagram at least once a week?",                   "ans":45},
    {"id":7,  "category":"Food & Drinks",  "q":"What percentage of Indians eat street food at least twice a week?",                   "ans":73},
    {"id":8,  "category":"Tech & Phones",  "q":"What percentage of people use their phone while eating meals?",                       "ans":55},
    {"id":9,  "category":"Relationships",  "q":"What percentage of people say they have argued with someone over WhatsApp?",          "ans":68},
    {"id":10, "category":"Study Habits",   "q":"What percentage of students have copied homework from a friend at least once?",       "ans":82},
    {"id":11, "category":"Entertainment",  "q":"What percentage of people binge-watch a full series in one weekend?",                 "ans":48},
    {"id":12, "category":"Food & Drinks",  "q":"What percentage of people have eaten Maggi as a midnight snack?",                    "ans":76},
    {"id":13, "category":"Tech & Phones",  "q":"What percentage of students use YouTube for studying at least once a week?",          "ans":79},
    {"id":14, "category":"Social Media",   "q":"What percentage of people have pretended to be busy to avoid replying to a message?", "ans":71},
    {"id":15, "category":"Shopping",       "q":"What percentage of people buy things they do not need during a sale?",                "ans":63},
    {"id":16, "category":"Relationships",  "q":"What percentage of people have stalked an ex on social media?",                      "ans":57},
    {"id":17, "category":"Study Habits",   "q":"What percentage of students have pulled an all-nighter before an exam?",              "ans":84},
    {"id":18, "category":"Entertainment",  "q":"What percentage of people sing along when their favourite song plays?",               "ans":88},
    {"id":19, "category":"Food & Drinks",  "q":"What percentage of people prefer biryani over pizza?",                               "ans":69},
    {"id":20, "category":"Tech & Phones",  "q":"What percentage of people check their phone within 5 minutes of waking up?",         "ans":80},
    {"id":21, "category":"Social Media",   "q":"What percentage of people have posted a story just to make someone jealous?",         "ans":38},
    {"id":22, "category":"Relationships",  "q":"What percentage of people say they have a best friend they tell everything to?",      "ans":74},
    {"id":23, "category":"Shopping",       "q":"What percentage of people have bought something after seeing an ad on Instagram?",    "ans":52},
    {"id":24, "category":"Entertainment",  "q":"What percentage of people cry while watching emotional movies or shows?",             "ans":66},
    {"id":25, "category":"Study Habits",   "q":"What percentage of students have googled answers during an online exam?",             "ans":77},
    {"id":26, "category":"Food & Drinks",  "q":"What percentage of people have eaten food directly from the fridge without heating?", "ans":85},
    {"id":27, "category":"Tech & Phones",  "q":"What percentage of people feel anxious when phone battery drops below 20 percent?",   "ans":70},
    {"id":28, "category":"Relationships",  "q":"What percentage of people have forgiven someone who hurt them badly?",                "ans":62},
    {"id":29, "category":"Social Media",   "q":"What percentage of people spend more than 3 hours daily on social media?",            "ans":54},
    {"id":30, "category":"Entertainment",  "q":"What percentage of people have re-watched a movie or series more than twice?",        "ans":59},
]

MARGIN   = 20        # ±20% margin
PRIZE    = 100000    # 1 lakh per correct answer
NUM_QS   = 10        # 10 questions per game

# ─── SESSION HELPERS ───────────────────────────────────────────
def gs():
    return {
        "mode":         session.get("mode","single"),
        "questions":    list(session.get("questions",[])),
        "q_index":      session.get("q_index",0),
        "p1_answers":   list(session.get("p1_answers",[])),
        "p2_answers":   list(session.get("p2_answers",[])),
        "current_turn": session.get("current_turn","p1"),
        "phase":        session.get("phase","p1"),
        "lifelines":    dict(session.get("lifelines", {"dum":True,"double":True,"flip":True})),
        "streak":       session.get("streak", 0),
    }

def ss(s):
    for k,v in s.items(): session[k]=v
    session.modified=True

# ─── A* QUESTION SELECTION ──────────────────────────────────────
def astar_pick(n=NUM_QS):
    """Pick n questions from bank using A* spreading across categories."""
    pool = QUESTIONS[:]
    random.shuffle(pool)
    selected, used_cats = [], []
    heap = []
    for i,q in enumerate(pool):
        cat_pen = 0.5 if q["category"] in used_cats[-2:] else 0
        # h = variety penalty, g = index
        f = i + cat_pen
        heapq.heappush(heap,(f,i,q))
    picked = []
    while heap and len(picked)<n:
        _,_,q = heapq.heappop(heap)
        if q not in picked:
            picked.append(q)
            used_cats.append(q["category"])
    return picked

# ─── MINIMAX ────────────────────────────────────────────────────
def minimax(p1_score, p2_score, depth, is_max, alpha, beta, log):
    if depth == 0:
        return p1_score - p2_score
    INF = math.inf
    if is_max:
        best = -INF
        for move in [PRIZE, 0]:
            val = minimax(p1_score+move, p2_score, depth-1, False, alpha, beta, log)
            best = max(best,val); alpha = max(alpha,best)
            log.append({"depth":depth,"player":"MAX","move":move,"val":val,
                        "alpha":round(alpha),"beta":round(beta) if beta!=INF else "inf"})
            if beta <= alpha:
                log.append({"depth":depth,"player":"MAX","val":"PRUNED","alpha":round(alpha),"beta":"pruned"})
                break
        return best
    else:
        best = INF
        for move in [PRIZE, 0]:
            val = minimax(p1_score, p2_score+move, depth-1, True, alpha, beta, log)
            best = min(best,val); beta = min(beta,best)
            log.append({"depth":depth,"player":"MIN","move":move,"val":val,
                        "alpha":round(alpha) if alpha!=-INF else "-inf","beta":round(beta)})
            if beta <= alpha:
                log.append({"depth":depth,"player":"MIN","val":"PRUNED","alpha":"pruned","beta":round(beta)})
                break
        return best

# ─── BFS HINT ──────────────────────────────────────────────────
def bfs_hint(ans):
    visited, queue, log = set(), [(ans,0)], []
    while queue:
        node,dist = queue.pop(0)
        if node in visited or dist>1: continue
        visited.add(node); log.append({"node":node,"dist":dist})
        for nb in [node-10,node+10]:
            if 0<=nb<=100 and nb not in visited: queue.append((nb,dist+1))
    return {"hint_range":[max(0,ans-MARGIN),min(100,ans+MARGIN)],"bfs_log":log}

# ─── DFS HINT ──────────────────────────────────────────────────
def dfs_hint(ans, first_guess):
    path, stack = [], [(first_guess, abs(first_guess-ans))]
    while stack:
        node,dist = stack.pop()
        path.append({"node":node,"dist":dist})
        if dist<=MARGIN: break
        adj = -10 if node>ans else 10
        new = node+adj
        stack.append((new,abs(new-ans)))
    direction = "Go lower" if first_guess>ans+MARGIN else ("Go higher" if first_guess<ans-MARGIN else "You are very close!")
    return {"direction":direction,"dfs_path":path[:5],"suggested":path[-1]["node"]}

# ─── CSP FLIP ──────────────────────────────────────────────────
def csp_flip(ans):
    correct = [max(0,ans-MARGIN), min(100,ans+MARGIN)]
    for _ in range(30):
        c = random.randint(5,95)
        wrong = [max(0,c-MARGIN),min(100,c+MARGIN)]
        if wrong[1]<correct[0] or wrong[0]>correct[1]: break
    ranges = [correct,wrong]; random.shuffle(ranges)
    steps = [
        {"step":"Variables",    "action":"Range A and Range B each span the margin width"},
        {"step":"Constraint 1", "action":"Answer must fall inside exactly one range"},
        {"step":"Constraint 2", "action":"Ranges must not overlap (AC-3 arc consistency)"},
        {"step":"Solution",     "action":f"Range A: {ranges[0][0]}-{ranges[0][1]}%   Range B: {ranges[1][0]}-{ranges[1][1]}%"},
    ]
    return {"range_a":ranges[0],"range_b":ranges[1],"csp_steps":steps}

# ─── BAYESIAN ADVICE ───────────────────────────────────────────
def bayes_advice(q_index, lifelines_left, streak):
    prior     = max(0.15, 1.0-(q_index/10)*0.4)
    posterior = min(0.92, prior*(1+streak*0.06))
    boost     = 0.2 if lifelines_left>0 else 0
    p         = round(posterior,2)
    pl        = round(min(0.95,posterior+boost),2)
    ev_g      = round(p*PRIZE)
    ev_l      = round(pl*PRIZE)
    if p>0.65:  advice,reason="GUESS NOW",    f"{int(p*100)}% chance — you likely know this one!"
    elif lifelines_left==0: advice,reason="GUESS NOW","No lifelines left. Trust your instinct!"
    else:       advice,reason="USE LIFELINE", f"Lifeline raises EV from Rs.{ev_g:,} to Rs.{ev_l:,}."
    return {"p_correct":p,"p_lifeline":pl,"ev_guess":ev_g,"ev_lifeline":ev_l,
            "advice":advice,"reason":reason,
            "steps":[
                {"label":"Prior P(correct)",   "val":round(prior,2),     "formula":f"1 - {q_index}/10*0.4"},
                {"label":"Posterior (streak)", "val":round(posterior,2), "formula":f"prior x (1+{streak}x0.06)"},
                {"label":"P(+lifeline)",        "val":pl,                "formula":f"{posterior} + {boost}"},
                {"label":"EV guess",           "val":f"Rs.{ev_g:,}",     "formula":f"{p} x Rs.{PRIZE:,}"},
                {"label":"EV lifeline",        "val":f"Rs.{ev_l:,}",     "formula":f"{pl} x Rs.{PRIZE:,}"},
            ]}

# ─── ROUTES ────────────────────────────────────────────────────
@app.route("/")
def index(): return render_template("index.html")

@app.route("/api/new_game", methods=["POST"])
def new_game():
    data = request.json or {}
    mode = data.get("mode","single")
    qs   = astar_pick(NUM_QS)
    session.clear()
    ss({"mode":mode,"questions":qs,"q_index":0,
        "p1_answers":[],"p2_answers":[],
        "current_turn":"p1","phase":"p1",
        "lifelines":{"dum":True,"double":True,"flip":True},
        "streak":0})
    return jsonify({"status":"ok","mode":mode,"total":NUM_QS})

@app.route("/api/question", methods=["GET"])
def get_question():
    s = gs()
    qs = s["questions"]
    qi = s["q_index"]
    if qi >= len(qs): return jsonify({"status":"done"})
    q  = qs[qi]
    return jsonify({"status":"ok","question":q["q"],"category":q["category"],
                    "q_index":qi,"total":NUM_QS,"margin":MARGIN,
                    "mode":s["mode"],"current_turn":s["current_turn"],
                    "phase":s["phase"]})

@app.route("/api/answer", methods=["POST"])
def answer():
    data  = request.json or {}
    guess = data.get("guess")
    s     = gs()
    qs    = s["questions"]
    qi    = s["q_index"]

    if qi >= len(qs): return jsonify({"status":"done"})
    try: guess = int(guess)
    except: return jsonify({"status":"error","msg":"Invalid number"})

    q       = qs[qi]
    ans     = q["ans"]
    correct = abs(guess-ans) <= MARGIN
    prize   = PRIZE if correct else 0
    diff    = abs(guess-ans)

    mode    = s["mode"]

    if mode == "single":
        p1a = s["p1_answers"]
        p1a.append({"q_index":qi,"guess":guess,"ans":ans,"correct":correct,"prize":prize,"diff":diff})
        s["p1_answers"] = p1a
        s["q_index"]    = qi+1
        s["streak"]     = s.get("streak",0)+1 if correct else 0
        ss(s)
        done = (qi+1 >= NUM_QS)
        return jsonify({"status":"correct" if correct else "wrong","ans":ans,
                        "guess":guess,"diff":diff,"prize":prize,"correct":correct,
                        "done":done,"q_index":qi})
    else:
        # Two-player: same question goes to p1 first, then p2
        phase = s["phase"]
        if phase == "p1":
            # P1 just answered — store, switch to p2 same question
            p1a = s["p1_answers"]
            p1a.append({"q_index":qi,"guess":guess,"ans":ans,"correct":correct,"prize":prize,"diff":diff})
            s["p1_answers"] = p1a
            s["phase"]      = "p2"
            s["current_turn"]="p2"
            ss(s)
            return jsonify({"status":"p1_done","ans":ans,"guess":guess,
                            "diff":diff,"prize":prize,"correct":correct,"q_index":qi})
        else:
            # P2 just answered — advance to next question
            p2a = s["p2_answers"]
            p2a.append({"q_index":qi,"guess":guess,"ans":ans,"correct":correct,"prize":prize,"diff":diff})
            s["p2_answers"]  = p2a
            s["q_index"]     = qi+1
            s["phase"]       = "p1"
            s["current_turn"]= "p1"
            ss(s)

            # Run minimax after each full round
            p1_total = sum(a["prize"] for a in s["p1_answers"])
            p2_total = sum(a["prize"] for a in s["p2_answers"])
            mm_log   = []
            remaining = NUM_QS - (qi+1)
            depth    = min(3, remaining*2)
            mm_val   = minimax(p1_total,p2_total,max(1,depth),True,-math.inf,math.inf,mm_log)

            done = (qi+1 >= NUM_QS)
            return jsonify({"status":"round_done","ans":ans,"guess":guess,
                            "diff":diff,"prize":prize,"correct":correct,"q_index":qi,
                            "p1_total":p1_total,"p2_total":p2_total,
                            "minimax_val":mm_val,"minimax_log":mm_log[:12],
                            "done":done})

@app.route("/api/results", methods=["GET"])
def results():
    s    = gs()
    p1a  = s["p1_answers"]
    p2a  = s["p2_answers"]
    p1t  = sum(a["prize"] for a in p1a)
    p2t  = sum(a["prize"] for a in p2a)
    p1c  = sum(1 for a in p1a if a["correct"])
    p2c  = sum(1 for a in p2a if a["correct"])

    # Final minimax decision
    mm_log = []
    mm_val = minimax(p1t,p2t,3,True,-math.inf,math.inf,mm_log)
    if s["mode"]=="two":
        if p1t>p2t:   winner="Player 1"
        elif p2t>p1t: winner="Player 2"
        else:         winner="Draw"
    else:
        winner="single"

    return jsonify({"mode":s["mode"],"p1_answers":p1a,"p2_answers":p2a,
                    "p1_total":p1t,"p2_total":p2t,"p1_correct":p1c,"p2_correct":p2c,
                    "winner":winner,"minimax_val":mm_val,"minimax_log":mm_log[:12],
                    "questions":s["questions"]})

@app.route("/api/lifeline/dum",    methods=["POST"])
def ll_dum():
    s=gs()
    if not s.get("lifelines",{}).get("dum"): return jsonify({"status":"used"})
    q=s["questions"][s["q_index"]]
    r=bfs_hint(q["ans"])
    life=dict(s.get("lifelines",{})); life["dum"]=False; s["lifelines"]=life; ss(s)
    return jsonify({"status":"ok",**r})

@app.route("/api/lifeline/double", methods=["POST"])
def ll_double():
    s=gs()
    if not s.get("lifelines",{}).get("double"): return jsonify({"status":"used"})
    life=dict(s.get("lifelines",{})); life["double"]=False; s["lifelines"]=life; ss(s)
    return jsonify({"status":"ok","msg":"You get 2 attempts on this question!"})

@app.route("/api/second_chance",   methods=["POST"])
def second_chance():
    data=request.json or {}
    s=gs(); q=s["questions"][s["q_index"]]
    r=dfs_hint(q["ans"],int(data.get("first_guess",50)))
    return jsonify({"status":"ok",**r})

@app.route("/api/lifeline/flip",   methods=["POST"])
def ll_flip():
    s=gs()
    if not s.get("lifelines",{}).get("flip"): return jsonify({"status":"used"})
    q=s["questions"][s["q_index"]]
    r=csp_flip(q["ans"])
    life=dict(s.get("lifelines",{})); life["flip"]=False; s["lifelines"]=life; ss(s)
    return jsonify({"status":"ok",**r})

@app.route("/api/bayes",           methods=["GET"])
def bayes():
    s=gs()
    life=s.get("lifelines",{}); ll=sum(1 for v in life.values() if v)
    return jsonify(bayes_advice(s["q_index"],ll,s.get("streak",0)))

if __name__=="__main__": app.run(debug=True,port=5000)
