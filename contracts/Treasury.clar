(define-constant ERR-NOT-AUTHORIZED u300)
(define-constant ERR-INSUFFICIENT-FUNDS u301)
(define-constant ERR-INVALID-AMOUNT u302)
(define-constant ERR-PROPOSAL-NOT-FOUND u303)
(define-constant ERR-PROPOSAL-NOT-EXECUTED u304)
(define-constant ERR-ALREADY-PAUSED u305)
(define-constant ERR-NOT-PAUSED u306)
(define-constant ERR-INVALID-RECIPIENT u307)
(define-constant ERR-TRANSFER-FAILED u308)
(define-constant ERR-INVALID-GOVERNANCE u309)
(define-constant ERR-INVALID-VOTING u310)
(define-constant ERR-CONTRIBUTION-LOCKED u311)
(define-constant ERR-INVALID-CONTRIBUTION u312)

(define-data-var governance-contract principal .governance)
(define-data-var voting-contract principal .voting)
(define-data-var paused bool false)
(define-data-var total-funds uint u0)

(define-map contributions
  principal
  { amount: uint, locked-until: uint })

(define-read-only (get-total-funds)
  (var-get total-funds))

(define-read-only (get-contribution (contributor principal))
  (map-get? contributions contributor))

(define-read-only (get-governance-contract)
  (var-get governance-contract))

(define-read-only (get-voting-contract)
  (var-get voting-contract))

(define-read-only (is-paused)
  (var-get paused))

(define-private (validate-amount (amount uint))
  (if (> amount u0)
    (ok true)
    (err ERR-INVALID-AMOUNT)))

(define-private (validate-recipient (recipient principal))
  (if (not (is-eq recipient 'SP000000000000000000002Q6VF78))
    (ok true)
    (err ERR-INVALID-RECIPIENT)))

(define-private (is-owner (caller principal))
  (is-eq caller (contract-call? .governance get-dao-owner)))

(define-public (set-governance-contract (new-gov principal))
  (begin
    (asserts! (is-owner tx-sender) (err ERR-NOT-AUTHORIZED))
    (try! (validate-recipient new-gov))
    (var-set governance-contract new-gov)
    (ok true)))

(define-public (set-voting-contract (new-voting principal))
  (begin
    (asserts! (is-owner tx-sender) (err ERR-NOT-AUTHORIZED))
    (try! (validate-recipient new-voting))
    (var-set voting-contract new-voting)
    (ok true)))

(define-public (pause-treasury)
  (begin
    (asserts! (is-owner tx-sender) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (var-get paused)) (err ERR-ALREADY-PAUSED))
    (var-set paused true)
    (ok true)))

(define-public (unpause-treasury)
  (begin
    (asserts! (is-owner tx-sender) (err ERR-NOT-AUTHORIZED))
    (asserts! (var-get paused) (err ERR-NOT-PAUSED))
    (var-set paused false)
    (ok true)))

(define-public (contribute (amount uint))
  (begin
    (asserts! (not (var-get paused)) (err ERR-ALREADY-PAUSED))
    (try! (validate-amount amount))
    (try! (contract-call? .wellness-token transfer amount tx-sender (as-contract tx-sender) none))
    (let ((current (default-to { amount: u0, locked-until: u0 } (map-get? contributions tx-sender))))
      (map-set contributions tx-sender
        { amount: (+ (get amount current) amount), locked-until: (+ block-height u1440) })
      (var-set total-funds (+ (var-get total-funds) amount))
      (print { event: "contribution", contributor: tx-sender, amount: amount })
      (ok true))))

(define-public (withdraw-contribution (amount uint))
  (begin
    (asserts! (not (var-get paused)) (err ERR-ALREADY-PAUSED))
    (try! (validate-amount amount))
    (let ((contrib (unwrap! (map-get? contributions tx-sender) (err ERR-INVALID-CONTRIBUTION))))
      (asserts! (>= block-height (get locked-until contrib)) (err ERR-CONTRIBUTION-LOCKED))
      (asserts! (>= (get amount contrib) amount) (err ERR-INSUFFICIENT-FUNDS))
      (try! (as-contract (contract-call? .wellness-token transfer amount tx-sender tx-sender none)))
      (map-set contributions tx-sender
        { amount: (- (get amount contrib) amount), locked-until: (get locked-until contrib) })
      (var-set total-funds (- (var-get total-funds) amount))
      (print { event: "withdrawal", contributor: tx-sender, amount: amount })
      (ok true))))

(define-public (disburse-proposal-funds (proposal-id uint) (recipient principal))
  (let ((proposal (unwrap! (contract-call? .voting get-proposal proposal-id) (err ERR-PROPOSAL-NOT-FOUND))))
    (asserts! (is-owner tx-sender) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (var-get paused)) (err ERR-ALREADY-PAUSED))
    (asserts! (get executed proposal) (err ERR-PROPOSAL-NOT-EXECUTED))
    (try! (validate-recipient recipient))
    (try! (validate-amount (get budget proposal)))
    (asserts! (>= (var-get total-funds) (get budget proposal)) (err ERR-INSUFFICIENT-FUNDS))
    (try! (as-contract (contract-call? .wellness-token transfer (get budget proposal) tx-sender recipient none)))
    (var-set total-funds (- (var-get total-funds) (get budget proposal)))
    (print { event: "disbursement", proposal-id: proposal-id, recipient: recipient, amount: (get budget proposal) })
    (ok true)))