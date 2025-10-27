(define-constant ERR-NOT-AUTHORIZED u200)
(define-constant ERR-INVALID-PROPOSAL u201)
(define-constant ERR-PROPOSAL-EXISTS u202)
(define-constant ERR-PROPOSAL-NOT-FOUND u203)
(define-constant ERR-VOTING-ENDED u204)
(define-constant ERR-VOTING-NOT-STARTED u205)
(define-constant ERR-ALREADY-VOTED u206)
(define-constant ERR-INSUFFICIENT-BALANCE u207)
(define-constant ERR-INVALID-DESCRIPTION u208)
(define-constant ERR-INVALID-BUDGET u209)
(define-constant ERR-INVALID-DURATION u210)
(define-constant ERR-PROPOSAL-ACTIVE u211)
(define-constant ERR-QUORUM-NOT-MET u212)
(define-constant ERR-MAX-PROPOSALS-EXCEEDED u213)
(define-constant ERR-INVALID-GOVERNANCE u214)
(define-constant ERR-ALREADY-EXECUTED u215)

(define-data-var governance-contract principal .governance)
(define-data-var max-proposals uint u500)
(define-data-var next-proposal-id uint u0)

(define-map proposals
  uint
  {
    proposer: principal,
    description: (string-utf8 256),
    budget: uint,
    duration: uint,
    start-block: uint,
    end-block: uint,
    yes-votes: uint,
    no-votes: uint,
    executed: bool
  })

(define-map votes
  { proposal-id: uint, voter: principal }
  bool)

(define-read-only (get-proposal (id uint))
  (map-get? proposals id))

(define-read-only (get-vote (id uint) (voter principal))
  (map-get? votes { proposal-id: id, voter: voter }))

(define-read-only (get-governance-contract)
  (var-get governance-contract))

(define-read-only (get-proposal-count)
  (var-get next-proposal-id))

(define-private (validate-description (desc (string-utf8 256)))
  (if (and (> (len desc) u0) (<= (len desc) u256))
    (ok true)
    (err ERR-INVALID-DESCRIPTION)))

(define-private (validate-budget (budget uint))
  (if (> budget u0)
    (ok true)
    (err ERR-INVALID-BUDGET)))

(define-private (validate-duration (duration uint))
  (if (> duration u0)
    (ok true)
    (err ERR-INVALID-DURATION)))

(define-private (has-sufficient-balance (caller principal) (amount uint))
  (let ((balance (unwrap-panic (contract-call? .wellness-token get-balance caller))))
    (>= balance amount)))

(define-private (get-voting-params)
  (let ((gov (var-get governance-contract)))
    (unwrap-panic
      (contract-call? gov get-voting-params))))

(define-public (set-governance-contract (new-gov principal))
  (begin
    (asserts! (is-eq tx-sender (contract-call? .governance get-dao-owner)) (err ERR-NOT-AUTHORIZED))
    (var-set governance-contract new-gov)
    (ok true)))

(define-public (create-proposal (description (string-utf8 256)) (budget uint) (duration uint))
  (let ((id (var-get next-proposal-id))
        (params (get-voting-params))
        (start block-height)
        (end (+ start (get proposal-duration params))))
    (asserts! (< id (var-get max-proposals)) (err ERR-MAX-PROPOSALS-EXCEEDED))
    (asserts! (not (contract-call? .governance is-paused)) (err ERR-NOT-AUTHORIZED))
    (asserts! (has-sufficient-balance tx-sender u100) (err ERR-INSUFFICIENT-BALANCE))
    (try! (validate-description description))
    (try! (validate-budget budget))
    (try! (validate-duration duration))
    (map-set proposals id
      {
        proposer: tx-sender,
        description: description,
        budget: budget,
        duration: duration,
        start-block: start,
        end-block: end,
        yes-votes: u0,
        no-votes: u0,
        executed: false
      })
    (var-set next-proposal-id (+ id u1))
    (print { event: "proposal-created", id: id, proposer: tx-sender })
    (ok id)))

(define-public (vote-on-proposal (id uint) (vote bool))
  (let ((proposal (unwrap! (map-get? proposals id) (err ERR-PROPOSAL-NOT-FOUND)))
        (balance (unwrap-panic (contract-call? .wellness-token get-balance tx-sender))))
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
        (params (get-voting-params))
        (total-supply (unwrap-panic (contract-call? .wellness-token get-total-supply)))
        (total-votes (+ (get yes-votes proposal) (get no-votes proposal)))
        (quorum (* total-supply (get quorum-percentage params) (/ u100))))
    (asserts! (is-eq tx-sender (contract-call? .governance get-dao-owner)) (err ERR-NOT-AUTHORIZED))
    (asserts! (>= block-height (get end-block proposal)) (err ERR-PROPOSAL-ACTIVE))
    (asserts! (not (get executed proposal)) (err ERR-ALREADY-EXECUTED))
    (asserts! (>= total-votes quorum) (err ERR-QUORUM-NOT-MET))
    (asserts! (> (get yes-votes proposal) (get no-votes proposal)) (err ERR-INVALID-PROPOSAL))
    (map-set proposals id (merge proposal { executed: true }))
    (print { event: "proposal-executed", id: id })
    (ok true)))