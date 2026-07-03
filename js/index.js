const SCOPE_ACTIVITY_FITNESS_READONLY = "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly"

const loadFrame = document.getElementById("load_frame")
const loadLabel = loadFrame.querySelector("strong")

function handleCredentialResponse(response) {
	const responsePayload = decodeJwtResponse(response.credential)

	console.log(response.credential)
	console.log("ID: " + responsePayload.sub)
	console.log("Full Name: " + responsePayload.name)
	console.log("Given Name: " + responsePayload.given_name)
	console.log("Family Name: " + responsePayload.family_name)
	console.log("Image URL: " + responsePayload.picture)
	console.log("Email: " + responsePayload.email)
}

function decodeJwtResponse(token) {
	let base64Url = token.split(".")[1]
	let base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/")
	let jsonPayload = decodeURIComponent(atob(base64).split("").map(function (c) {
		return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)
	}).join(""))

	return JSON.parse(jsonPayload)
}

/**
 * Converts a Date object into a Google Date
 * @param {Date} date The date to convert
 */
function getCivilDate(date) {
	return {
		year: date.getUTCFullYear(),
		month: date.getUTCMonth() + 1,
		day: date.getUTCDate()
	}
}

/**
 * Converts two Date objects into a Google CivilTimeInterval
 * @param {Date} start The starting Date
 * @param {Date} end The ending Date
 */
function getCivilTimeInterval(start, end) {
	return {
		start: { date: getCivilDate(start) },
		end: { date: getCivilDate(end) }
	}
}

/**
 * Creates a Google CivilTimeInterval from a Date Pivot and an offset in days
 * @param {Date} a The Date pivot
 * @param {number} count The number of days to offset. Can be negative
 */
function getDayInterval(a, count) {
	if (count > 0) {
		return {
			start: { date: getCivilDate(a) },
			end: { date: getCivilDate(new Date(a.getTime() + count * 86400000)), time: { hours: 23, minutes: 59 } }
		}
	} else {
		return {
			start: { date: getCivilDate(new Date(a.getTime() + count * 86400000)) },
			end: { date: getCivilDate(a), time: { hours: 23, minutes: 59 } }
		}
	}
}

function main() {
	loadLabel.innerText = "Requesting Data..."
	const batch = gapi.client.newBatch()
	const resource = {
		range: getDayInterval(new Date(), -7)
	}

	batch.add(gapi.client.health.users.dataTypes.dataPoints.dailyRollUp({
		parent: "users/me/dataTypes/steps",
		resource
	}), { id: "steps" })

	batch.add(gapi.client.health.users.dataTypes.dataPoints.dailyRollUp({
		parent: "users/me/dataTypes/distance",
		resource
	}), { id: "distance" })

	batch.then((result) => {
		if (!result.result) {
			loadLabel.innerText = "Failure"
			return
		}

		const steps = result.result.steps
		if (!steps) {
			loadLabel.innerText = "Failure"
			return
		}

		if (!steps.result) {
			loadLabel.innerText = "Failure"
			return
		}

		const distance = result.result.distance
		if (!steps) {
			loadLabel.innerText = "Failure"
			return
		}

		if (!steps.result) {
			loadLabel.innerText = "Failure"
			return
		}

		loadLabel.innerText = "Success"
		console.log(steps.result, distance.result)
	}).catch((error) => {
		console.error(error)
	})
}

gapi.load("client", async () => {
	const token = localStorage.getItem("access_token")
	const exp = localStorage.getItem("exp")

	if (token && exp && exp > Date.now()) {
		gapi.client.setToken({
			access_token: token
		})

		await gapi.client.load("https://health.googleapis.com/$discovery/rest?version=v4")
		main()
	} else {
		const modal = new bootstrap.Modal('#signin_model')
		const signinButton = document.getElementById("signin_button")
		const tokenClient = google.accounts.oauth2.initTokenClient({
			client_id: "630310444486-1qlt8f3u2n35rglmtjbuc6vkcstavihh.apps.googleusercontent.com",
			scope: SCOPE_ACTIVITY_FITNESS_READONLY,
			prompt: "",
			callback: (tokenResponse) => {
				if (!tokenResponse?.access_token) {
					console.warn("No token response provided")
					signinButton.disabled = false
					signinButton.children[0].hidden = true
					signinButton.children[1].innerText = "Sign In"
					return
				}

				if (!google.accounts.oauth2.hasGrantedAllScopes(tokenResponse, SCOPE_ACTIVITY_FITNESS_READONLY)) {
					console.warn("Desired scopes have not been granted")
					signinButton.disabled = false
					signinButton.children[0].hidden = true
					signinButton.children[1].innerText = "Sign In"
					return
				}

				localStorage.setItem("access_token", tokenResponse.access_token)
				localStorage.setItem("exp", Date.now() + tokenResponse.expires_in * 1000)
				modal.hide()
				main()
			}
		})

		signinButton.onclick = () => {
			signinButton.disabled = true
			signinButton.children[0].hidden = false
			signinButton.children[1].innerText = "Signing In..."
			tokenClient.requestAccessToken()
		}

		gapi.client.load("https://health.googleapis.com/$discovery/rest?version=v4")
		modal.show()
	}
})