import tkinter as tk
from tkinter import messagebox, scrolledtext
import random

class AvalonApp:
    def __init__(self, root):
        self.root = root
        self.root.title('"The Resistance: Avalon" v2.3.1')

        # Player setup
        self.original_players = []

        self.leader_index = None  # index in original_players for rotating leadership

        self.entries = []
        self.use_merlin = tk.BooleanVar(value=True)
        self.use_percival = tk.BooleanVar(value=True)
        self.use_oberon = tk.BooleanVar(value=False)
        self.use_mordred = tk.BooleanVar(value=False)
        self.roles = {}
        self.current_player_index = 0

        # Game state
        self.round_number = 1
        self.failed_proposals = 0
        self.current_leader = None
        self.selected_team = []
        self.mission_results = []  # True=pass, False=fail
        self.metadata = []
        self.past_missions = []
        self.winning_team = None  # "Good", "Evil", or None

        # Config
        self.max_failed_proposals = 5

        self.setup_ui()

    # ---------- SETUP UI ----------
    def setup_ui(self):
        self.clear_root()
        tk.Label(self.root, text="Enter 5–10 player names:", font=("Arial",14)).pack(pady=10)
        frame = tk.Frame(self.root); frame.pack()
        for i in range(10):
            e = tk.Entry(frame, width=20)
            e.grid(row=i, column=0, padx=5, pady=2)
            self.entries.append(e)
        cb = tk.Frame(self.root); cb.pack(pady=10)
        tk.Checkbutton(cb, text="Include Merlin & Assassin", variable=self.use_merlin).pack(anchor='w')
        tk.Checkbutton(cb, text="Include Percival & Morgana", variable=self.use_percival).pack(anchor='w')
        tk.Checkbutton(cb, text="Include Oberon", variable=self.use_oberon).pack(anchor='w')
        tk.Checkbutton(cb, text="Include Mordred", variable=self.use_mordred).pack(anchor='w')
        tk.Button(self.root, text="Start Game", command=self.validate_and_confirm).pack(pady=15)

    def validate_and_confirm(self):
        names = [e.get().strip() for e in self.entries if e.get().strip()]
        if not 5 <= len(names) <= 10:
            messagebox.showerror("Invalid Player Count","Enter between 5 and 10 names.")
            return

        has_duplicates = len(names) != len(set(names))
        if has_duplicates:
            messagebox.showerror(
                "Duplicate Names Inputted",
                "You have entered duplicate names;\n"
                "please remove any duplicates before proceeding."
            )
            return

        if self.use_percival.get() and not self.use_merlin.get():
            messagebox.showerror("Invalid Roles","Percival/Morgana require Merlin/Assassin.")
            return

        n = len(names)
        # how many evils total in this player‑count
        evil_count = {5:2, 6:2, 7:3, 8:3, 9:3, 10:4}[n]

        # count how many special‐Evil toggles are ON:
        evil_specials = (
            self.use_merlin.get()    # implies Assassin
          + self.use_percival.get()  # implies Morgana
          + self.use_oberon.get()
          + self.use_mordred.get()
        )
        if evil_specials > evil_count:
            messagebox.showerror(
                "Too Many Evil Roles",
                f"You selected {evil_specials} special Evil roles,\n"
                f"but only {evil_count} Evil players exist."
            )
            return

        self.original_players = names
        self.metadata.append(f"Game start: players {', '.join(names)}")
        self.show_confirmation()

    def show_confirmation(self):
        self.clear_root()
        n = len(self.original_players)
        evil = {5:2,6:2,7:3,8:3,9:3,10:4}[n]
        good = n - evil
        summary = (
            f"Players: {n}" + "     " +
            f"Good: {good}" + "     " +
            f"Evil: {evil}" + "     " +
            f"Merlin/Assassin: {'Yes' if self.use_merlin.get() else 'No'}" + "     " +
            f"Percival/Morgana: {'Yes' if self.use_percival.get() else 'No'}" + "     " +
            f"Oberon: {'Yes' if self.use_oberon.get() else 'No'}" + "     " +
            f"Mordred: {'Yes' if self.use_mordred.get() else 'No'}" + "     " +
            f"Missions: 5" + "     " +
            f"4th-Mission Double-Fail: {'Yes' if (n >= 7) else 'No'}"
        )
        tk.Label(self.root, text="Game Setup Summary", font=("Arial",16,"bold")).pack(pady=10)
        tk.Label(self.root, text=summary, font=("Arial",12), justify="left").pack(padx=20)
        tk.Button(self.root, text="Continue", command=self.assign_roles).pack(pady=15)
        self.metadata.append(f'''
Summary:
{n} players;
5 missions; 
Merlin/Assassin {'enabled' if self.use_merlin.get() else 'disabled'};
Percival/Morgana {'enabled' if self.use_percival.get() else 'disabled'};
Oberon {'enabled' if self.use_oberon.get() else 'disabled'};
Mordred {'enabled' if self.use_mordred.get() else 'disabled'};
4th-mission double-fail {'enabled' if (n >= 7) else 'disabled'}.
        ''')

    # ---------- ROLE ASSIGNMENT ----------
    def assign_roles(self):
        n = len(self.original_players)
        evil = {5:2,6:2,7:3,8:3,9:3,10:4}[n]
        good = n - evil
        roles = ['Evil']*evil + ['Good']*good
        specials = []
        if self.use_merlin.get():
            roles.remove('Good'); specials.append('Merlin')
            roles.remove('Evil'); specials.append('Assassin')
        if self.use_percival.get():
            roles.remove('Good'); specials.append('Percival')
            roles.remove('Evil'); specials.append('Morgana')
        if self.use_oberon.get():
            roles.remove('Evil')
            specials.append('Oberon')
        if self.use_mordred.get():
            roles.remove('Evil')
            specials.append('Mordred')
        deck = roles + specials
        random.shuffle(deck)
        # assign in input order
        self.roles = dict(zip(self.original_players, deck))
        self.metadata.append("Roles assigned.")
        self.current_player_index = 0
        self.leader_index = random.randint(0, len(self.original_players) - 1)
        self.show_role_privacy()

    # ---------- PRIVACY & ROLE REVEAL ----------
    def show_role_privacy(self):
        self.clear_root()
        if self.current_player_index >= len(self.original_players):
            self.start_team_proposal()
            return
        p = self.original_players[self.current_player_index]
        tk.Label(self.root, text=f"{p}, pass phone and press to view your role.", font=("Arial",14)).pack(pady=30)
        tk.Button(self.root, text="Show Role", command=self.show_actual_role).pack(pady=15)

    def show_actual_role(self):
        self.clear_root()
        p = self.original_players[self.current_player_index]
        r = self.roles[p]
        col = 'blue' if r in ['Good','Merlin','Percival'] else 'red'
        tk.Label(self.root, text=f"{p}, your role:", font=("Arial",16)).pack(pady=10)
        tk.Label(self.root, text=r, font=("Arial",24,"bold"), fg=col).pack(pady=5)
        tk.Label(self.root, text=f"Team: {'Good guys' if col=='blue' else 'Evil guys'}", font=("Arial",14), fg=col).pack(pady=5)
        info = ""
        note = ""
        if r == 'Merlin':
            ev = [x for x,y in self.roles.items() if y in ['Evil','Assassin','Morgana','Oberon']]
            info = "Evil guys:\n" + "\n".join(ev)
            if self.use_mordred.get():
                note = "\n There is a an unknown Mordred among the Evils.\n"
        elif r == 'Percival':
            ml = [x for x,y in self.roles.items() if y in ['Merlin','Morgana']]
            random.shuffle(ml)
            info = "Merlin is one of:\n" + "\n".join(ml)
        elif r in ['Evil','Assassin','Morgana','Mordred']:
            mates = [x for x, y in self.roles.items() if y in ['Evil','Assassin','Morgana','Mordred'] and x!=p]
            info = "Your fellow Evil:\n" + ", ".join(mates)
            if self.use_oberon.get():
                note = "\n There is an unknown Oberon among your fellow Evils.\n"
        elif r == 'Oberon':
            info = "You are Evil, but you know no other Evils (they don’t know you)."

        if info:
            tk.Label(self.root, text=info, font=("Arial",12), justify="center").pack(pady=10)
            tk.Label(self.root, text=note, font=("Arial",12,"bold"), fg="grey", justify="center").pack(pady=10)
        tk.Button(self.root, text="Continue", command=self.next_reveal).pack(pady=15)

    def next_reveal(self):
        self.current_player_index += 1
        self.show_role_privacy()

    # ---------- TEAM PROPOSAL & VOTING ----------
    def start_team_proposal(self):
        self.clear_root()

        # log round start once
        if self.failed_proposals == 0 and not any(f"Round {self.round_number} start" in m for m in self.metadata):
            self.metadata.append(f"Round {self.round_number} start")
        # Choose leader based on rotating index
        self.current_leader = self.original_players[self.leader_index]
        self.leader_index = (self.leader_index + 1) % len(self.original_players)
        self.metadata.append(f"Leader '{self.current_leader}' selected for Round {self.round_number}")
        # team size
        n = len(self.original_players)
        # Prepare mission sizes with asterisk on Mission 4 for 7+ players (new edit, not tested yet)
        sizes = {5: [2, 3, 2, 3, 3], 6: [2, 3, 4, 3, 4], 7: [2, 3, 3, 4, 4], 8: [3, 4, 4, 5, 5], 9: [3, 4, 4, 5, 5],
                 10: [3, 4, 4, 5, 5]}
        msizes = sizes[n][:]  # copy the list
        if n >= 7:
            msizes[3] = str(msizes[3]) + "*"  # add asterisk to Mission 4

        ts = sizes[n][self.round_number-1]
        # past missions
        past = ""
        for i,m in enumerate(self.past_missions,1):
            res = "Passed" if m['pass'] else 'Failed'
            past += f"M{i}: Leader {m['leader']} team {m['team']} -> {res}"
            '''if not m['pass']:'''
            past += f" (Fails: {m['fails']})"
            past += "\n"
        # UI
        tk.Label(self.root, text="Team Proposal Phase", font=("Arial",14,"bold")).pack()
        info = (
            f"Round {self.round_number}/5 | Leader: {self.current_leader}\n"
            f"Team size: {ts}\n"
            f"Failed proposals: {self.failed_proposals}/{self.max_failed_proposals}\n"
            # changed from {sizes[n]} to {msizes}
            f"Mission sizes: {msizes}"
        )
        tk.Label(self.root, text=info, font=("Arial",10), justify="left").pack(padx=10)
        # Leadership rotation display

        # Display leadership rotation with current leader in brackets
        tk.Label(self.root, text="Leadership Order:", font=("Arial", 10, "underline")).pack(pady=(5, 0))

        rotated = []
        for p in self.original_players:
            if p == self.current_leader:
                rotated.append(f"[{p}]")  # Highlight current leader
            else:
                rotated.append(p)

        rotation_str = " → ".join(rotated)
        tk.Label(self.root, text=rotation_str, font=("Arial", 10), wraplength=1150, justify="center").pack()

        if past:
            tk.Label(self.root, text="Past Missions:", font=("Arial",12,"underline")).pack(pady=(5,0))
            tk.Label(self.root, text=past, font=("Arial",10), justify="left").pack(padx=10)

        # Horizontal layout: team voting on left, metadata on right
        side_by_side = tk.Frame(self.root)
        side_by_side.pack(pady=10)

        # Right panel = metadata
        right = tk.Frame(side_by_side)
        tk.Label(right, text="Metadata:", font=("Arial", 12, "underline")).pack(pady=(0, 5))
        txt = scrolledtext.ScrolledText(right, width=40, height=10)
        for line in reversed(self.metadata): txt.insert('end', line + "\n")
        txt.config(state='disabled')
        txt.pack()
        right.pack(anchor='ne', side='right', padx=10)

        # Left panel = team selection checkboxes
        left = tk.Frame(side_by_side)
        tk.Label(left, text="Select Team Members:", font=("Arial", 12, "underline")).pack(pady=(0, 5))
        self.check_vars = {}
        for p in self.original_players:
            v = tk.BooleanVar()
            cb = tk.Checkbutton(left, text=p, variable=v)
            cb.pack(anchor='w')
            self.check_vars[p] = v
        tk.Button(left, text="Submit Team", command=lambda: self.ask_vote(ts)).pack(pady=10)
        left.pack(side='left', padx=10)

        # this indicative assignment is kinda risky if I plan in the future to use a similar note feature elsewhere.
        gameplay_note = ""
        if (self.round_number == 4) and n >= 7:
            gameplay_note = "This round requires 2 fail submissions to count as failed."
        tk.Label(self.root, text=gameplay_note, font=("Arial", 12, "bold"), fg="grey", justify='center').pack(pady=10)

        # persistent summary
        evil = {5:2,6:2,7:3,8:3,9:3,10:4}[n]
        good = n - evil

        summary = (
            f"Players: {n}" + "     " +
            f"Good: {good}" + "     " +
            f"Evil: {evil}" + "     " +
            f"Merlin/Assassin: {'Yes' if self.use_merlin.get() else 'No'}" + "     " +
            f"Percival/Morgana: {'Yes' if self.use_percival.get() else 'No'}" + "     " +
            f"Oberon: {'Yes' if self.use_oberon.get() else 'No'}" + "     " +
            f"Mordred: {'Yes' if self.use_mordred.get() else 'No'}" + "     " +
            f"Missions: 5" + "     " +
            f"4th-Mission Double-Fail: {'Yes' if (n >= 7) else 'No'}"
        )
        tk.Label(self.root, text=summary, font=("Arial", 8), fg='gray', anchor='center', justify='center').pack(
            side='bottom', pady=10)

    def ask_vote(self, req):
        sel = [p for p,v in self.check_vars.items() if v.get()]
        if len(sel) != req:
            messagebox.showerror("Team Size Incorrect", f"Select exactly {req} players.")
            return
        self.selected_team = sel
        self.metadata.append(f"Proposal by {self.current_leader}: {sel}")
        self.clear_root()
        tk.Label(self.root, text="Team Vote", font=("Arial",16)).pack(pady=10)
        tk.Label(self.root, text="Approved by majority?", font=("Arial",12)).pack(pady=5)
        tk.Button(self.root, text="Approved", command=self.team_approved).pack(pady=5)
        tk.Button(self.root, text="Rejected", command=self.team_rejected).pack(pady=5)

    def team_rejected(self):
        self.failed_proposals += 1
        self.metadata.append(f"Proposal by {self.current_leader} rejected")
        if self.failed_proposals >= self.max_failed_proposals:
            self.metadata.append(f"Mission {self.round_number} auto-fail after {self.failed_proposals} rejections")
            self.past_missions.append({'leader': self.current_leader, 'team': [], 'pass': False, 'fails': 0})
            self.mission_results.append(False)  # <-- THIS LINE COUNTS THE FAIL!
            # check end of game
            gw = self.mission_results.count(True)
            ew = self.mission_results.count(False)
            if ew >= 3:
                self.winning_team = "Evil"
                self.show_final_stats()
                return
            # advance round
            self.round_number += 1
            self.failed_proposals = 0
            self.start_team_proposal()
        else:
            self.start_team_proposal()

    def team_approved(self):
        self.metadata.append(f"Proposal by {self.current_leader} approved: {self.selected_team}")
        self.begin_mission_voting()

    # ---------- MISSION VOTING ----------
    def begin_mission_voting(self):
        self.mission_votes = []
        self.mission_vote_index = 0
        self.show_next_mission_vote()

    def show_next_mission_vote(self):
        self.clear_root()
        if self.mission_vote_index >= len(self.selected_team):
            self.show_mission_reveal_privacy()
            return
        p = self.selected_team[self.mission_vote_index]
        is_evil = self.roles[p] in ['Evil','Assassin','Morgana','Oberon','Mordred']
        tk.Label(self.root, text=f"{p}, your mission vote:", font=("Arial",14)).pack(pady=10)
        def sub(v):
            if not is_evil and v=='Fail': v='Pass'
            self.mission_votes.append(v)
            self.mission_vote_index += 1
            self.show_next_mission_vote()
        tk.Button(self.root, text="Pass", command=lambda: sub('Pass')).pack(pady=5)
        tk.Button(self.root, text="Fail", command=lambda: sub('Fail')).pack(pady=5)

    def show_mission_reveal_privacy(self):
        self.clear_root()
        tk.Label(self.root, text="Pass the phone to a neutral player.", font=("Arial", 14)).pack(pady=20)
        tk.Label(self.root, text="Press the button below to reveal the mission result.", font=("Arial", 12)).pack(
            pady=10)
        tk.Button(self.root, text="Reveal Mission Result", command=self.show_mission_result).pack(pady=20)

    def show_mission_result(self):
        self.clear_root()
        fails = self.mission_votes.count('Fail')
        # Apply special rule for Mission 4 (index 3), 7+ players:
        if len(self.original_players) >= 7 and self.round_number == 4:
            passed = (fails < 2)
        else:
            passed = (fails == 0)
        self.past_missions.append({'leader': self.current_leader, 'team': self.selected_team, 'pass': passed, 'fails': fails})
        self.metadata.append(f"Mission {self.round_number} result: {'Passed' if passed else 'Failed'} ({fails}/{len(self.selected_team)})")
        tk.Label(self.root, text="Mission Results", font=("Arial",16)).pack(pady=10)
        tk.Label(self.root, text=f"Fails: {fails}", font=("Arial",12)).pack()
        tk.Label(self.root, text=("PASSED!" if passed else "FAILED!"), font=("Arial",14,"bold"), fg=('green' if passed else 'red')).pack(pady=5)
        self.mission_results.append(passed)
        gw = self.mission_results.count(True)
        ew = self.mission_results.count(False)
        # if good reached 3, show PASS then assassin
        if gw >= 3:
            if self.use_merlin.get():
                tk.Button(self.root, text="Proceed to Assassin", command=self.assassin_phase).pack(pady=10)
            else:
                self.winning_team = "Good"
                tk.Button(self.root, text="End Game", command=self.show_final_stats).pack(pady=10)
        elif ew >= 3:
            tk.Button(self.root, text="End Game", command=self.show_final_stats).pack(pady=10)
        else:
            self.round_number += 1
            self.failed_proposals = 0
            tk.Button(self.root, text="Continue", command=self.start_team_proposal).pack(pady=10)

    # ---------- ASSASSIN PHASE ----------
    def assassin_phase(self):
        self.clear_root()
        assassin_name = next((p for p, r in self.roles.items() if r == 'Assassin'), None)
        tk.Label(self.root, text="Final Mission PASSED!", font=("Arial", 16), fg='blue').pack(pady=10)
        if assassin_name:
            tk.Label(self.root, text=f"Assassin: {assassin_name}, choose a player to kill:", font=("Arial", 12)).pack(
                pady=5)
        else:
            tk.Label(self.root, text="Choose a player to assassinate:", font=("Arial", 12)).pack(pady=5)

        self.kill_vars = {}
        for p in self.original_players:
            if self.roles[p] in ['Good', 'Merlin', 'Percival']:
                v = tk.BooleanVar()
                cb = tk.Checkbutton(self.root, text=p, variable=v)
                cb.pack(anchor='w')
                self.kill_vars[p] = v
        tk.Button(self.root, text="Assassinate", command=self.resolve_assassin).pack(pady=10)

    def resolve_assassin(self):
        chosen = [p for p,v in self.kill_vars.items() if v.get()]
        if len(chosen) != 1:
            messagebox.showerror("Select One","Select exactly one to assassinate.")
            return
        target = chosen[0]
        if self.roles.get(target) == 'Merlin':
            self.winning_team = "Evil"
            messagebox.showinfo("Result", f"{target} was Merlin. Evil wins!")
        else:
            self.winning_team = "Good"
            messagebox.showinfo("Result", f"{target} was not Merlin. Good wins!")
        self.show_final_stats()

    # ---------- FINAL STATS ----------
    def show_final_stats(self):
        self.clear_root()

        # New logic, uses self.winning_team
        if self.winning_team == "Good":
            win_text = "Good Wins!"
        elif self.winning_team == "Evil":
            win_text = "Evil Wins!"
        else:
            win_text = "Evil Wins!"
        tk.Label(self.root, text=win_text, font=("Arial", 14, "bold"), fg="blue" if 'Good' in win_text else "red").pack(
            pady=5)

        tk.Label(self.root, text="Game Over - Final Stats", font=("Arial",16,"bold")).pack(pady=10)
        # Roles reveal
        tk.Label(self.root, text="Role Reveals:", font=("Arial",14)).pack(pady=5)
        for p in self.original_players:
            tk.Label(self.root, text=f"{p}: {self.roles[p]}").pack()
        # Mission summary
        tk.Label(self.root, text="\nMission Summary:", font=("Arial",14)).pack(pady=5)
        for i,m in enumerate(self.past_missions,1):
            res = "Passed" if m['pass'] else 'Failed'
            tk.Label(self.root, text=f"Mission {i} (Leader: {m['leader']}) {res} ({m['fails']} fails)").pack()
        tk.Button(self.root, text="Close", command=self.root.quit).pack(pady=15)
        tk.Label(self.root, text="Program developed by Adway Patel", font=("Arial", 8), fg='gray', anchor='center',
                 justify='center').pack(side='bottom', pady=10)

    def clear_root(self):
        for w in self.root.winfo_children(): w.destroy()


if __name__ == "__main__":
    root = tk.Tk()
    app = AvalonApp(root)
    root.mainloop()

# Avalon: The Resistance  v2.3.1, public variant; archival text removed.
# Developed with usage of ChatGPT 3.5
# Written and prompted by Adway Patel
