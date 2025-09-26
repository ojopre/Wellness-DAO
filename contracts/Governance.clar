(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-VOTING-THRESHOLD u101)
(define-constant ERR-INVALID-QUORUM u102)
(define-constant ERR-INVALID-PROPOSAL-DURATION u103)
(define-constant ERR-INVALID-UPGRADE-PROPOSAL u104)
(define-constant ERR-CONTRACT-NOT-FOUND u105)
(define-constant ERR-ALREADY-PAUSED u106)
(define-constant ERR-NOT-PAUSED u107)
(define-constant ERR-INVALID-PARAM u108)
(define-constant ERR-PROPOSAL-ACTIVE u109)
(define-constant ERR-PROPOSAL-NOT-FOUND u110)
(define-constant ERR-INSUFFICIENT-BALANCE u111)
(define-constant ERR-ALREADY-VOTED u112)
(define-constant ERR-VOTING-ENDED u113)
(define-constant ERR-VOTING-NOT-STARTED u114)
(define-constant ERR-INVALID-CONTRACT-PRINCIPAL u115)
(define-constant ERR-MAX-PROPOSALS-EXCEEDED u116)
(define-constant ERR-INVALID-EMERGENCY u117)
(define-constant ERR-INVALID-TOKEN-CONTRACT u118)
(define-constant ERR-TRANSFER-FAILED u119)
(define-constant ERR-INVALID-REWARD-RATE u120)

(define-data-var dao-owner principal tx-sender)
(define-data-var voting-threshold uint u51)
(define-data-var quorum-percentage uint u20)
(define-data-var proposal-duration uint u1440)
(define-data-var paused bool false)
(define-data-var next-proposal-id uint u0)
(define-data-var max-proposals uint u100)
(define-data-var token-contract principal 'SP000000000000000000002Q6VF78.wellness-token)
(define-data-var reward-rate uint u5)

(define-map contract-addresses
  (string-ascii 32)
  principal)

(define-map proposals
  uint
  {
    proposer: principal,
    description: (string-utf8 256),
    target-contract: (string-ascii 32),
    new-address: (optional principal),
    param-key: (optional (string-ascii 32)),
    param-value: (optional uint),
    start-block: uint,
    end-block: uint,
    yes-votes: uint,
    no-votes: uint,
    executed: bool
  })

(define-map votes
  { proposal-id: uint, voter: principal }
  bool)

(define-read-only (get-dao-owner)
  (var-get dao-owner))

(define-read-only (get-voting-threshold)
  (var-get voting-threshold))

(define-read-only (get-quorum-percentage)
  (var-get quorum-percentage))

(define-read-only (get-proposal-duration)
  (var-get proposal-duration))

(define-read-only (is-paused)
  (var-get paused))

(define-read-only (get-contract-address (name (string-ascii 32)))
  (map-get? contract-addresses name))

(define-read-only (get-proposal (id uint))
  (map-get? proposals id))

(define-read-only (get-vote (id uint) (voter principal))
  (map-get? votes { proposal-id: id, voter: voter }))

(define-private (validate-threshold (threshold uint))
  (if (and (> threshold u50) (<= threshold u100))
    (ok true)
    (err ERR-INVALID-VOTING-THRESHOLD)))

(define-private (validate-quorum (quorum uint))
  (if (and (> quorum u0) (<= quorum u100))
    (ok true)
    (err ERR-INVALID-QUORUM)))

(define-private (validate-duration (duration uint))
  (if (> duration u0)
    (ok true)
    (err ERR-INVALID-PROPOSAL-DURATION)))

(define-private (validate-principal (p principal))
  (if (not (is-eq p 'SP000000000000000000002Q6VF78))
    (ok true)
    (err ERR-INVALID-CONTRACT-PRINCIPAL)))

(define-private (validate-reward-rate (rate uint))
  (if (and (> rate u0) (<= rate u10))
    (ok true)
    (err ERR-INVALID-REWARD-RATE)))

(define-private (is-owner (caller principal))
  (is-eq caller (var-get dao-owner)))

(define-private (has-sufficient-balance (caller principal) (amount uint))
  (let ((balance (unwrap-panic (contract-call? .wellness-token get-balance caller))))
    (>= balance amount)))

(define-public (set-dao-owner (new-owner principal))
  (begin
    (asserts! (is-owner tx-sender) (err ERR-NOT-AUTHORIZED))
    (try! (validate-principal new-owner))
    (var-set dao-owner new-owner)
    (ok true)))

(define-public (set-voting-threshold (new-threshold uint))
  (begin
    (asserts! (is-owner tx-sender) (err ERR-NOT-AUTHORIZED))
    (try! (validate-threshold new-threshold))
    (var-set voting-threshold new-threshold)
    (ok true)))

(define-public (set-quorum-percentage (new-quorum uint))
  (begin
    (asserts! (is-owner tx-sender) (err ERR-NOT-AUTHORIZED))
    (try! (validate-quorum new-quorum))
    (var-set quorum-percentage new-quorum)
    (ok true)))

(define-public (set-proposal-duration (new-duration uint))
  (begin
    (asserts! (is-owner tx-sender) (err ERR-NOT-AUTHORIZED))
    (try! (validate-duration new-duration))
    (var-set proposal-duration new-duration)
    (ok true)))

(define-public (set-token-contract (new-contract principal))
  (begin
    (asserts! (is-owner tx-sender) (err ERR-NOT-AUTHORIZED))
    (try! (validate-principal new-contract))
    (var-set token-contract new-contract)
    (ok true)))

(define-public (set-reward-rate (new-rate uint))
  (begin
    (asserts! (is-owner tx-sender) (err ERR-NOT-AUTHORIZED))
    (try! (validate-reward-rate new-rate))
    (var-set reward-rate new-rate)
    (ok true)))

(define-public (pause-dao)
  (begin
    (asserts! (is-owner tx-sender) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (var-get paused)) (err ERR-ALREADY-PAUSED))
    (var-set paused true)
    (ok true)))

(define-public (unpause-dao)
  (begin
    (asserts! (is-owner tx-sender) (err ERR-NOT-AUTHORIZED))
    (asserts! (var-get paused) (err ERR-NOT-PAUSED))
    (var-set paused false)
    (ok true)))

(define-public (create-upgrade-proposal (description (string-utf8 256)) (target (string-ascii 32)) (new-address principal))
  (let ((id (var-get next-proposal-id))
        (start block-height)
        (end (+ start (var-get proposal-duration))))
    (asserts! (not (var-get paused)) (err ERR-ALREADY-PAUSED))
    (asserts! (< id (var-get max-proposals)) (err ERR-MAX-PROPOSALS-EXCEEDED))
    (asserts! (has-sufficient-balance tx-sender u100) (err ERR-INSUFFICIENT-BALANCE))
    (try! (validate-principal new-address))
    (map-set proposals id
      {
        proposer: tx-sender,
        description: description,
        target-contract: target,
        new-address: (some new-address),
        param-key: none,
        param-value: none,
        start-block: start,
        end-block: end,
        yes-votes: u0,
        no-votes: u0,
        executed: false
      })
    (var-set next-proposal-id (+ id u1))
    (print { event: "proposal-created", id: id })
    (ok id)))

(define-public (create-param-proposal (description (string-utf8 256)) (key (string-ascii 32)) (value uint))
  (let ((id (var-get next-proposal-id))
        (start block-height)
        (end (+ start (var-get proposal-duration))))
    (asserts! (not (var-get paused)) (err ERR-ALREADY-PAUSED))
    (asserts! (< id (var-get max-proposals)) (err ERR-MAX-PROPOSALS-EXCEEDED))
    (asserts! (has-sufficient-balance tx-sender u100) (err ERR-INSUFFICIENT-BALANCE))
    (map-set proposals id
      {
        proposer: tx-sender,
        description: description,
        target-contract: "",
        new-address: none,
        param-key: (some key),
        param-value: (some value),
        start-block: start,
        end-block: end,
        yes-votes: u0,
        no-votes: u0,
        executed: false
      })
    (var-set next-proposal-id (+ id u1))
    (print { event: "proposal-created", id: id })
    (ok id)))

(define-public (vote-on-proposal (id uint) (vote bool))
  (let ((proposal (unwrap! (map-get? proposals id) (err ERR-PROPOSAL-NOT-FOUND)))
        (balance (unwrap-panic (contract-call? .wellness-token get-balance tx-sender))))
    (asserts! (not (var-get paused)) (err ERR-ALREADY-PAUSED))
    (asserts! (>= block-height (get start-block proposal)) (err ERR-VOTING-NOT-STARTED))
    (asserts! (< block-height (get end-block proposal)) (err ERR-VOTING-ENDED))
    (asserts! (is-none (map-get? votes { proposal-id: id, voter: tx-sender })) (err ERR-ALREADY-VOTED))
    (if vote
      (map-set proposals id (merge proposal { yes-votes: (+ (get yes-votes proposal) balance) }))
      (map-set proposals id (merge proposal { no-votes: (+ (get no-votes proposal) balance) })))
    (map-set votes { proposal-id: id, voter: tx-sender } vote)
    (print { event: "vote-cast", id: id, voter: tx-sender, vote: vote })
    (ok true)))

(define-public (execute-proposal (id uint))
  (let ((proposal (unwrap! (map-get? proposals id) (err ERR-PROPOSAL-NOT-FOUND)))
        (total-supply (unwrap-panic (contract-call? .wellness-token get-total-supply)))
        (total-votes (+ (get yes-votes proposal) (get no-votes proposal)))
        (quorum (* total-supply (var-get quorum-percentage) (/ u100))))
    (asserts! (is-owner tx-sender) (err ERR-NOT-AUTHORIZED))
    (asserts! (>= block-height (get end-block proposal)) (err ERR-PROPOSAL-ACTIVE))
    (asserts! (not (get executed proposal)) (err ERR-ALREADY-PAUSED))
    (asserts! (>= total-votes quorum) (err ERR-INVALID-QUORUM))
    (asserts! (> (get yes-votes proposal) (get no-votes proposal)) (err ERR-INVALID-VOTING-THRESHOLD))
    (match (get new-address proposal)
      addr (begin
        (map-set contract-addresses (get target-contract proposal) addr)
        (print { event: "contract-upgraded", target: (get target-contract proposal), new-address: addr }))
      (match (get param-key proposal)
        key (let ((val (unwrap-panic (get param-value proposal))))
          (if (is-eq key "voting-threshold")
            (var-set voting-threshold val)
            (if (is-eq key "quorum-percentage")
              (var-set quorum-percentage val)
              (if (is-eq key "proposal-duration")
                (var-set proposal-duration val)
                (if (is-eq key "reward-rate")
                  (var-set reward-rate val)
                  (err ERR-INVALID-PARAM)))))
          (print { event: "param-updated", key: key, value: val }))
        (err ERR-INVALID-UPGRADE-PROPOSAL)))
    (map-set proposals id (merge proposal { executed: true }))
    (try! (contract-call? .wellness-token mint (* (get yes-votes proposal) (var-get reward-rate) (/ u100)) (get proposer proposal)))
    (ok true)))

(define-public (emergency-withdraw (amount uint) (recipient principal))
  (begin
    (asserts! (is-owner tx-sender) (err ERR-NOT-AUTHORIZED))
    (asserts! (var-get paused) (err ERR-NOT-PAUSED))
    (try! (as-contract (contract-call? .wellness-token transfer amount tx-sender recipient none)))
    (ok true)))