**What's this**  
This method is primarily to save time whilst allowing you to work with other people inside of a repository to push modpacks/servers to your Helios Launcher. It uses Gitlab's pipeline system to build a distribution file from a specified Nebula repository, where the required files are then moved directly to your webserver location (with the help of Docker's volume mapping system) where the launcher will look for the distribution.json file. When using it to publish 5 large modpacks/servers in our own setup, the entire deployment (after you have pushed your changes) took only a little over a minute until it was live on the launcher.

> The speed of your deployment will entirely depend on the speed of your machine that runs the Gitlab Runner. I'm using an active I9 9900K machine for my our deployment, which gives us the speed detailed above.

**Requirements:**
- Ubuntu 16.04/18.04 (ideally)
- [Gitlab](https://gitlab.com)
- [Gitlab Runner](https://docs.gitlab.com/runner/install/) (running on Docker) **(read note)**
- Apache/Nginx Webserver **(read note)**
- [Accessable Nebula Repository](https://github.com/dscalzi/Nebula/)

> For this particular setup, you **must** have the Gitlab Runner on the same machine as the webserver. Something else to note is the faster your machine, the faster the gitlab runner will be able to process the build.

**Things to know**  
I recommend using a subdomain for your launcher files as I have used in my examples below, but it's not required. If you haven't set up a subdomain and are using Apache, you can find a tutorial [here](https://www.digitalocean.com/community/tutorials/how-to-set-up-apache-virtual-hosts-on-ubuntu-16-04). For Nginx users, you can use [this](https://www.digitalocean.com/community/tutorials/how-to-set-up-nginx-server-blocks-virtual-hosts-on-ubuntu-16-04).

It's also recommended to secure your subdomain with an SSL certificate, which you can do for free with Certbot. A tutorial can be found [here](https://certbot.eff.org/instructions).

# What to do:
## Step 1)
First you'll want to make sure that you've created a repository where you will manage your launcher's server files. This must be on [Gitlab](https://gitlab.com) which is completely free, for public and private projects. Once you have created your repository, you will want to clone it locally and start preparing your file structure for Nebula to read from.

```
./meta/
./servers/
.env
```

When setting up your file structure, you will want to ensure that it matches the setup that your Nebula build requires:  
![](https://i.imgur.com/hzxGvLi.png)  
![](https://i.imgur.com/UiIeUB9.png)  

Your .env file will also need to match this format:
```env
JAVA_EXECUTABLE=/jvm/java-8-openjdk-amd64/bin/java
ROOT=../
BASE_URL=<distribution folder url>
```
**What are these?**  
`JAVA_EXECUTABLE` This determines the location of Java which Nebula will use during the deployment process. Assuming you have installed Java using: `sudo apt-get install openjdk-8-jre` your path will be the same as the format above, so you wouldn't need to change that. This path will be necessary later on, so don't forget it!

`ROOT` This is where Nebula will search for the files. With the setup I'm documenting, this can be left to `../`.

`BASE_URL` This is where the distribution.json will specify where the server files are stored and will be accessable by the launcher. You will need to make sure that the files here will be publicly accessable.

## Step 2)
 Once you are happy with your fresh server/modpack setup, and have specified all the necessary information using the documentation shown above, you can go ahead and push your changes to the repository. Since you may be uploading a lot of unqiue mods and files, it could take some time initally depending on your internet speed and the size of the servers. 

## Step 3) 
Now we will want to ensure that your Gitlab Runner is configured correctly. Go to the `config.toml` for your runner, and ensure that your configuration looks largely like this:  
![](https://i.imgur.com/Gdq8qMw.png)

**What do I change?**  
You will want to ensure that everything below the `executor = "docker"` is present inside of your configuration too. The only thing you may need to change is the `volumes` section.  

Volumes are areas of your machine that docker will allow you to map inside of your pipeline container which handles the deployment process. The format for each mapping in the list is `*path/to/machine/folder*:*path/to/map*:*permission*`. I have one volume that maps my webserver directory which is the directory where my launcher files are moved to **(Required)**, and also a mapping for a parent of my machine's JVM path. **(Required)**.

For example, if you were wanting to store your distribution.json file inside `https://launcher.example.com` (this would also be your `BASE_URL`) which was stored in the directory `/var/www/launcher`, the first part of your mapping would be `/var/www/launcher` and your second part would be how you want to access it inside of your CI build (which I will document also), which for my build is `/launcher`. The last part is the permission of the internal mapped folder, which should be readwrite. Therefore your launcher folder mapping will be: `"/var/www/launcher:/launcher:rw"`

You will need the JVM mapping too, which I would recommend leaving as the example in the screenshot above.

Finally, you can now restart your gitlab runner with `docker restart gitlab-runner`. This is required in order for your changes to take effect!

## Step 4)
Once you've checked that your gitlab runner has started without problems, we can now prepare your `.gitlab-ci.yml` which will handle the relatively simple deployment process.

Go ahead and create a `.gitlab-ci.yml` file inside of your repository and paste this inside of there as a template:
```yml
image: node:latest

stages:
  - build

build:
  stage: build
  only:
    - master
  script:
    - git clone https://github.com/dscalzi/Nebula.git
    - mv .env Nebula/
    - cd Nebula/
    - npm install
    - echo "Cloned and installed Nebula"

    - echo "Building distribution.json"
    - npm run start -- generate distro
    
    - echo "Clearing existing deployment folder"
    - rm -rf /launcher/*

    - echo "Moving all new launcher folders to deployment"
    - cd ../
    - mv ./meta /launcher/
    - mv ./servers /launcher/
    - mv ./repo /launcher/
    - mv ./distribution.json /launcher/
```
**What's it doing?**  
Firstly, it's ensuring that the build is using a container that has nodejs pre-installed, which is used for installing and using Nebula.

In the `only` section of the build, we have it specified that it will only run on the master branch which would usually be where most commits take place. In my personal script (which is very similar), I have it so that it will only build on a `live` branch, which I merge `master` into once I am happy with the changes made. As soon as this build successfully completes at any time, the changes will be available on the launcher.

The first stage of the script is where Nebula is being built and installed. It's also grabbing our repository's `.env` file and ensuring that it's available in the Nebula directory for later use. Since we have `cd`'d into the Nebula directory, the `.env` specifies that the ROOT is located in `../` which will be the directory outside of the root directory (the repository) where our launcher files are stored.

Afterwards, it'll use Nebula to generate the distribution.json file and any other files that it requires for the distribution to function (such as the `./repo` folder for Forge).

The script will then go ahead and clear your existing launcher-files directory (using your `/launcher` mapping as set in your runner configuration), before going ahead and moving over all of the necessary launcher files into that empty directory, ensuring that all launcher files are fresh and relevant.

Since we are using `mv` and not `cp` or `rsync`, the transfer is almost instant. 

## Step 5)
Lastly, you can now go ahead and push your `.gitlab-ci-yml` file to the repository, where it should start the pipeline immediately for your deployment to take place. I would highly recommend taking a look at the process inside of Gitlab to ensure that it successfully completes. 

Now you'll just need to ensure that your Helios Launcher is pointing to the correct location where the `distribution.json` is located, such as `https://launcher.example.com/distribution.json`.

Hope this helps!