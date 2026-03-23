const GOOGLE_CLIENT_ID = "476397425230-589marau60i4fog9skjabvimr5pihfgd.apps.googleusercontent.com";
const GOOGLE_REDIRECT_URI = "https://americanssupport.org/gads/api/auth/oauth/callback";

function generateState() {
    return crypto.randomUUID();
}

document.getElementById("login").onclick = function () {

    const state = generateState();

    // store per user session
    localStorage.setItem("oauth_state", state);

    const url =
        "https://accounts.google.com/o/oauth2/v2/auth"
        + "?client_id=" + GOOGLE_CLIENT_ID
        + "&redirect_uri=" + GOOGLE_REDIRECT_URI
        + "&response_type=code"
        + "&scope=https://www.googleapis.com/auth/adwords"
        + "&access_type=offline"
        + "&prompt=consent"
        + "&state=" + state;

    window.location.href = url;
}