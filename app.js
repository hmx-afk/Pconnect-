function onIncompletePaymentFound(payment) {
    console.log("Incomplete payment:", payment);

    if (!payment || !payment.identifier) {
        return;
    }

    const txid = payment.transaction?.txid;

    if (!txid) {
        console.log(
            "Incomplete payment found, but txid is not available yet."
        );
        return;
    }

    fetch("/api/complete", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            paymentId: payment.identifier,
            txid: txid
        })
    })
        .then(res => res.json())
        .then(data => {
            console.log("Incomplete payment handled:", data);
        })
        .catch(err => {
            console.error(
                "Incomplete payment cleanup failed:",
                err
            );
        });
}
