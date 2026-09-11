} catch (error) {
    console.error(error);
    status.textContent =
        "Connection failed: " + JSON.stringify(error) + " | " + error.message;
}
