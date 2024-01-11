var store = [{
        "title": "Object.requireNonNull(), Map -  getOrDefault (), compute(), computeIfAbsent()",
        "excerpt":"// 개선 전 // friend는 [[\"json\", \"john\"], [\"john\", \"mike\"]...] 이런 데이터가 담긴 List이다. private static Map&lt;String, List&lt;String&gt;&gt; makeFriendRelation(List&lt;List&lt;String&gt;&gt; friends) { HashMap&lt;String, List&lt;String&gt;&gt;friendsRelation = new HashMap&lt;&gt;(); for (List&lt;String&gt; friendPair:friends) { Objects.requireNonNull(friendsRelation.put(friendPair.get(FRIEND_A),new ArrayList&lt;&gt;())) .add(friendPair.get(FRIEND_B)); Objects.requireNonNull(friendsRelation.put(friendPair.get(FRIEND_B),new ArrayList&lt;&gt;())) .add(friendPair.get(FRIEND_A)); } return friendsRelation; } makeFriendRelation() 메서드는 friends 리스트에 담긴 친구관계를 Map&lt;String, List&lt;String&gt;&gt; 타입으로 담아서 반환하려는...","categories": ["Java"],
        "tags": ["Data Structure","Solution"],
        "url": "http://localhost:4000/java/Object.requireNonNull()-Map-getOrDefault()-compute()-computeIfAbsent()/",
        "teaser": null
      },{
        "title": "자료구조 contains(), add()",
        "excerpt":"isValidDuplicated 메서드는 친구관계를 나타내는 friends 리스트에서 [[”json”, “john”], [”john”, “json”]] 과 같이 중복되는 친구관계가 담겨있는지 확인하는 메서드이다. // 개선 전 // friend는 [[\"json\", \"john\"], [\"john\", \"mike\"]...] 이런 데이터가 담긴 List이다. private static boolean isValidDuplicated(List&lt;List&lt;String&gt;&gt; friends) { Set&lt;List&lt;String&gt;&gt; uniqueFriends = new HashSet&lt;&gt;(); for (List&lt;String&gt; friendPair : friends) { if (uniqueFriends.contains(friendPair) ||...","categories": ["Java"],
        "tags": ["Data Structure","Solution"],
        "url": "http://localhost:4000/java/%EC%9E%90%EB%A3%8C%EA%B5%AC%EC%A1%B0-contains()-add()/",
        "teaser": null
      },{
        "title": "String, StringBuffer, StringBuilder",
        "excerpt":"String String 클래스는 불변(Immutable)한 문자열을 나타낸다. 한 번 문자열 리터럴이 생성되면 수정할 수 없다. Java에서는 String Constant Pool 또는 상수풀(Constant Pool)이라고 하는 문자열 리터럴을 관리하는 특별한 메모리 영역으로, JVM 내부에 존재하며 문자열 리터럴을 저장하고 재사용하는 역할을 한다. 문자열 리터럴이란? 문자열 리터럴은 소스코드에서 문자열 값을 표현하는 고정된 문자열이다. Constant Pool의 특징...","categories": ["Java"],
        "tags": ["String","StringBuffer","StringBuilder"],
        "url": "http://localhost:4000/java/String-StringBuffer-StringBuilder/",
        "teaser": null
      },{
        "title": "객체지향 변경에 유연한 코드 리팩토링",
        "excerpt":"리팩토링 전 코드는 크게 두 가지 기능으로 영화관에서 관람객이 티켓을 구매하거나 초대권을 사용하여 입장, 카페에서 고객이 캐셔에게 음료 주문을 하여 바리스타가 주문을 바탕으로 음료를 만들어주는 기능을 하는 코드였다. 하지만 기능이 동작하는 것과 별개로 각 객체들이 너무 많은 범위의 책임을 가지고 있었고, 클래스 간의 관계가 강하게 결합되어있어 확장이 어렵고 코드를 읽는...","categories": ["Java"],
        "tags": ["객체지향","SOLID","Refactor"],
        "url": "http://localhost:4000/java/%EB%B3%80%EA%B2%BD%EC%97%90-%EC%9C%A0%EC%97%B0%ED%95%9C-%EC%BD%94%EB%93%9C-%EB%A6%AC%ED%8C%A9%ED%86%A0%EB%A7%81/",
        "teaser": null
      },{
        "title": "TDD 학점 계산기 만들기",
        "excerpt":"학점을 구하는 방법 = (교과목 학점 + 평점)의 합 / 수강신청 총 학점 수. 객체지향 설계 및 구현 도메인을 구성하는 객체에는 어떤 것들이 있는지 고민. 객체들 간의 관계를 고민. 동적인 객체를 정적인 타입으로 추상화하여 도메인 모델링. 협력을 설계. 객체들을 포괄하는 타입에 적절한 책임을 할당. 구현. 1. 도메인을 구성하는 객체에는 어떤...","categories": ["Java"],
        "tags": ["객체지향","일급 컬렉션","TDD","Refactor"],
        "url": "http://localhost:4000/java/%ED%95%99%EC%A0%90-%EA%B3%84%EC%82%B0%EA%B8%B0-%EB%A7%8C%EB%93%A4%EA%B8%B0/",
        "teaser": null
      },{
        "title": "JUnit 5 - @ParameterizedTest",
        "excerpt":"@ParameterizedTest @ParameterizedTest 어노테이션은 매개변수화된 테스트를 정의하는 데 사용한다. 이 어노테이션을 사용하면 동일한 테스트 메소드를 여러 다른 입력 값으로 여러 번 실행할 수 있다. @ParameterizedTest와 함께 사용하는 어노테이션 @ParameterizedTest 어노테이션과 관련된 어노테이션들을 사용하여 여러 다양한 입력 값에 대한 테스트를 작성하고 코드 중복을 최소화할 수 있다. 1. @ValueSource @ValueSource 어노테이션은 기본 타입과...","categories": ["Java"],
        "tags": ["JUnit 5","ParameterizedTest"],
        "url": "http://localhost:4000/java/JUnit5-@ParameterizedTest/",
        "teaser": null
      },{
        "title": "Stream.collect() - Collectors",
        "excerpt":"private static List&lt;String&gt; WORDS = Arrays.asList(\"TONY\", \"a\", \"hULK\", \"B\", \"america\", \"X\", \"nebula\", \"Korea\"); // List에 저장된 단어들 중에서 단어의 길이가 2 이상인 경우에만, 모든 단어를 대문자로 변환하여 스페이스로 구분한 하나의 문자열로 합한 결과를 반환하여라. // ex) [\"Hello\", \"a\", \"Island\", \"b\"] -&gt; “H I” public String quiz2() { return WORDS.stream() .filter(string...","categories": ["Java"],
        "tags": ["Stream","Collectors"],
        "url": "http://localhost:4000/java/Stream.collect()-Collectors/",
        "teaser": null
      },{
        "title": "Java 표준 입출력 테스트",
        "excerpt":"표준 입력과 출력을 테스트하는 방법은 여러 가지가 있지만, 이 코드에서는 System.setIn(InputStream)과 System.setOut(PrintStream)을 이용하여 표준 입력과 출력을 변경한다. 먼저 ByteArrayInputStream은 InputStream, ByteArrayOutputStream은 OutputStream 인터페이스를 구현한 클래스다. ByteArrayInputStream 이 클래스는 내부적으로 바이트 배열을 유지하며, 이 배열에서 데이터를 읽을 수 있는 기능을 제공한다. ByteArrayInputStream의 주요 메서드 read(): 이 메서드는 스트림에서 다음 바이트를 읽어서...","categories": ["Java"],
        "tags": ["Test","표준 입출력"],
        "url": "http://localhost:4000/java/Standard-Input-Output-Test/",
        "teaser": null
      },{
        "title": "EnumMap",
        "excerpt":"EnumMap은 Java에서 제공하는 Map 인터페이스 구현체 중 하나다. 주요 특징 Key로 Enum을 사용: EnumMap은 이름에서 알 수 있듯이, 키로 Enum 타입만을 사용할 수 있다. 키의 타입이 제한적이지만, 이를 통해 EnumMap은 효율적인 성능을 제공합니다. 순서 보장: EnumMap에서는 키가 선언된 순서에 따라 데이터가 저장되며 조회된다. 이는 정렬에 대한 추가적인 작업 없이도 순서를...","categories": ["Java"],
        "tags": ["Map","EnumMap"],
        "url": "http://localhost:4000/java/EnumMap/",
        "teaser": null
      },{
        "title": "Functional Interface API",
        "excerpt":"Functional Interface는 함수를 일급객체처럼 다룰 수 있게 해주는 단 하나의 추상 메서드를 가지는 인터페이스이다. final 상수나 default, static, private 메서드는 추상 메서드가 아니기 때문에, 이들 여러개가 인터페이스에 들어있어도 단 한 개의 추상 메서드를 가지면 함수형 인터페이스로 취급 된다. 자바 8부터 인터페이스에 default 메서드와 static 메서드를 추가할 수 있게 되면서 가능해졌다....","categories": ["Java"],
        "tags": ["Functional Interface","함수형 메서드"],
        "url": "http://localhost:4000/java/Functional-Interface/",
        "teaser": null
      },{
        "title": "방어적 복사, 동일성, 동등성",
        "excerpt":"방어적 복사 public class Person { private List&lt;Food&gt; favoriteFoods; public Person(List&lt;Food&gt; favoriteFoods) { this.favoriteFoods = favoriteFoods; } public List&lt;Food&gt; getFavoriteFoods() { // return favoriteFoods; 원본의 참조를 그대로 반환하는 기존 코드. return new ArrayList&lt;&gt;(this.favoriteFoods); // 방어적 복사로 새로운 객체 생성. } } 원본과 동등한 새로운 객체를 만들어 원본 데이터의 참조와 동일하지...","categories": ["Java"],
        "tags": ["방어적 복사","동일성","동등성"],
        "url": "http://localhost:4000/java/%EB%B0%A9%EC%96%B4%EC%A0%81-%EB%B3%B5%EC%82%AC-%EB%8F%99%EC%9D%BC%EC%84%B1-%EB%8F%99%EB%93%B1%EC%84%B1/",
        "teaser": null
      },{
        "title": "캡슐화를 깨뜨리지 않는 Getter 사용",
        "excerpt":"public class Person { private List&lt;Food&gt; favoriteFoods; public Person(List&lt;Food&gt; favoriteFoods) { this.favoriteFoods = favoriteFoods; } public List&lt;Food&gt; getFavoriteFoods() { return favoriteFoods; } } public class Food { private String name; public Food(String name) { this.name = name; } public String getName() { return name; } public void setName(String name) {...","categories": ["Java"],
        "tags": ["캡슐화","Getter"],
        "url": "http://localhost:4000/java/%EC%BA%A1%EC%8A%90%ED%99%94%EB%A5%BC-%EA%B9%A8%EB%9C%A8%EB%A6%AC%EC%A7%80-%EC%95%8A%EB%8A%94-Getter/",
        "teaser": null
      },{
        "title": "Effective Java - 아이템 1: 생성자 대신 정적 팩터리 메서드를 고려하라",
        "excerpt":"정적 팩터리 메서드 new키워드로 생성하지 않고 객체 생성해서 반환하는 메서드다. // 필드가 private final이고 필드의 값을 수정하는 방법이 없기 때문에 불변 클래스다. public class MyNumber { public static final int ZERO = new MyNumber(0); // 여러 곳에서 사용하는 값을 캐싱. private final int number; // 생성자의 접근자를 private로 하여 외부에서...","categories": ["Java"],
        "tags": ["Effective Java"],
        "url": "http://localhost:4000/java/Effective-Java-%EC%95%84%EC%9D%B4%ED%85%9C-1-%EC%83%9D%EC%84%B1%EC%9E%90-%EB%8C%80%EC%8B%A0-%EC%A0%95%EC%A0%81-%ED%8C%A9%ED%84%B0%EB%A6%AC-%EB%A9%94%EC%84%9C%EB%93%9C%EB%A5%BC-%EA%B3%A0%EB%A0%A4%ED%95%98%EB%9D%BC/",
        "teaser": null
      },{
        "title": "Effective Java - 아이템 2: 생성자에 매개변수가 많다면 빌더를 고려하라",
        "excerpt":"빌더패턴 이전에 사용하던 방식 점층적 생성자 패턴 정적 팩터리와 생성자에는 선택적 매개변수가 많을 때 적절히 대응하기 어렵다는 제약이 있다. // 점층적 생성자 패턴을 사용하는 클래스(선택적 매개변수가 많아서 생성자 또한 많다) public class NutritionFacts { private final int servingSize; // 필수 private final int servings; // 필수 private final int calories;...","categories": ["Java"],
        "tags": ["Effective Java"],
        "url": "http://localhost:4000/java/Effective-Java-%EC%95%84%EC%9D%B4%ED%85%9C-2-%EC%83%9D%EC%84%B1%EC%9E%90%EC%97%90-%EB%A7%A4%EA%B0%9C%EB%B3%80%EC%88%98%EA%B0%80-%EB%A7%8E%EB%8B%A4%EB%A9%B4-%EB%B9%8C%EB%8D%94%EB%A5%BC-%EA%B3%A0%EB%A0%A4%ED%95%98%EB%9D%BC/",
        "teaser": null
      },{
        "title": "Effective Java - 아이템 3: private 생성자나 열거 타입으로 싱글턴임을 보증하라",
        "excerpt":"싱글턴(Singleton) 싱글턴이란 인스턴스를 오직 하나만 생성할 수 있는 클래스를 말한다. 싱글턴의 전형적인 예로는 무상태(stateless) 객체나 설계상 유일해야 하는 시스템 컴포넌트를 들 수 있다. 그러나 클래스를 싱글턴으로 만들면 이를 사용하는 클라이언트를 테스트하기 어려워질 수 있다. 싱글턴을 만드는 방식 3가지 공통점 두 방식 모두 생성자는 private로 감춰둔다. 유일한 인스턴스에 접근할 수 있는...","categories": ["Java"],
        "tags": ["Effective Java"],
        "url": "http://localhost:4000/java/Effective-Java-%EC%95%84%EC%9D%B4%ED%85%9C-3-private-%EC%83%9D%EC%84%B1%EC%9E%90%EB%82%98-%EC%97%B4%EA%B1%B0-%ED%83%80%EC%9E%85%EC%9C%BC%EB%A1%9C-%EC%8B%B1%EA%B8%80%ED%84%B4%EC%9E%84%EC%9D%84-%EB%B3%B4%EC%A6%9D%ED%95%98%EB%9D%BC/",
        "teaser": null
      },{
        "title": "Effective Java - 아이템 4: 인스턴스화를 막으려거든 private 생성자를 사용하라",
        "excerpt":"정적 멤버만 담은 유틸리티 클래스는 인스턴스로 만들어 쓰려고 설계한게 아니다. 하지만 생성자를 명시하지 않으면(직접 작성한 생성자가 하나도 없는 경우) 컴파일러가 자동으로 기본 생성자를 만들어준다. 사용자는 이 생성자가 자동 생성된 것인지 구분할 수 없다. // 인스턴스로 만들 의도가 없는 유틸리티 클래스 public class MyUtility { // 생성자가 하나도 없기 때문에 컴파일러가...","categories": ["Java"],
        "tags": ["Effective Java"],
        "url": "http://localhost:4000/java/Effective-Java-%EC%95%84%EC%9D%B4%ED%85%9C-4-%EC%9D%B8%EC%8A%A4%ED%84%B4%EC%8A%A4%ED%99%94%EB%A5%BC-%EB%A7%89%EC%9C%BC%EB%A0%A4%EA%B1%B0%EB%93%A0-private-%EC%83%9D%EC%84%B1%EC%9E%90%EB%A5%BC-%EC%82%AC%EC%9A%A9%ED%95%98%EB%9D%BC/",
        "teaser": null
      },{
        "title": "Effective Java - 아이템 5: 자원을 직접 명시하지 말고 의존 객체 주입을 사용하라",
        "excerpt":"// 정적 유틸리티를 잘못 사용한 예 - 유연하지 않고 테스트하기 어렵다. public class SpellChecker { private static final Lexicon dictionary = ...; private SpellChecker() {} // 객체 생성 방지 public static boolean isValid(String word) { ... } public static List&lt;String&gt; suggestions(String typo) { ... } } // 싱글턴을 잘못 사용한...","categories": ["Java"],
        "tags": ["Effective Java"],
        "url": "http://localhost:4000/java/Effective-Java-%EC%95%84%EC%9D%B4%ED%85%9C-5-%EC%9E%90%EC%9B%90%EC%9D%84-%EC%A7%81%EC%A0%91-%EB%AA%85%EC%8B%9C%ED%95%98%EC%A7%80-%EB%A7%90%EA%B3%A0-%EC%9D%98%EC%A1%B4-%EA%B0%9D%EC%B2%B4-%EC%A3%BC%EC%9E%85%EC%9D%84-%EC%82%AC%EC%9A%A9%ED%95%98%EB%9D%BC/",
        "teaser": null
      },{
        "title": "Effective Java - 아이템 6: 불필요한 객체 생성을 피하라",
        "excerpt":"기존 객체를 재사용해야 한다면 새로운 객체를 만들지 마라 똑같은 기능의 객체를 매번 생성하기보다 불변 객체처럼 재사용하는 편이 낫다. // 절대로 String은 new 키워드로 생성하지 말자. new 키워드로 생성시 인스턴스를 새로 만든다. String s1 = \"hi\"; String s2 = new String(\"hi\"); 생성자 대신 정적 팩터리 메서드를 제공하는 불변 클래스에서는 정적 팩터리...","categories": ["Java"],
        "tags": ["Effective Java"],
        "url": "http://localhost:4000/java/Effective-Java-%EC%95%84%EC%9D%B4%ED%85%9C-6-%EB%B6%88%ED%95%84%EC%9A%94%ED%95%9C-%EA%B0%9D%EC%B2%B4-%EC%83%9D%EC%84%B1%EC%9D%84-%ED%94%BC%ED%95%98%EB%9D%BC/",
        "teaser": null
      },{
        "title": "Effective Java - 아이템 7: 다 쓴 객체 참조를 해제하라",
        "excerpt":"메모리 누수가 있는 프로그램을 오래 실행하다 보면 점차 가비지 컬렉션 활동과 메모리 사용량이 늘어나 결국 성능이 저하된다. // 메모리 누수가 일어나는 코드 public class Stack { private Object[] elements; private int size = 0; private static final int DEFAULT_INITIAL_CAPACITY = 16; public Stack() { elements = new Object[DEFAULT_INITIAL_CAPACITY]; } public...","categories": ["Java"],
        "tags": ["Effective Java"],
        "url": "http://localhost:4000/java/Effective-Java-%EC%95%84%EC%9D%B4%ED%85%9C-7-%EB%8B%A4-%EC%93%B4-%EA%B0%9D%EC%B2%B4-%EC%B0%B8%EC%A1%B0%EB%A5%BC-%ED%95%B4%EC%A0%9C%ED%95%98%EB%9D%BC/",
        "teaser": null
      },{
        "title": "Effective Java - 아이템 8: finalizer와 cleaner 사용을 피하라",
        "excerpt":"자바는 두 가지 객체 소멸자를 제공한다. finalizer는 예측할 수 없고, 상황에 따라 위험할 수 있어 일반적으로 불필요하다. 그래서 기본적으로 쓰지 말아야 한다. finalizer의 대안으로 나온cleaner는 finalizer보다는 덜 위험하지만, 여전히 예측할 수 없고, 느리고, 일반적으로 불필요하다. 자바의 finalizer, cleaner는 C++의 파괴자(destructor)와 다른 개념이다. C++에서 파괴자(생성자의 꼭 필요한 대척점)는 특정 객체와 관련된...","categories": ["Java"],
        "tags": ["Effective Java"],
        "url": "http://localhost:4000/java/Effective-Java-%EC%95%84%EC%9D%B4%ED%85%9C-8-finalizer%EC%99%80-cleaner-%EC%82%AC%EC%9A%A9%EC%9D%84-%ED%94%BC%ED%95%98%EB%9D%BC/",
        "teaser": null
      },{
        "title": "Effective Java - 아이템 9: try-finally보다는 try-with-resources를 사용하라",
        "excerpt":"try-finally 전통적으로 예외가 발생하거나 메서드에서 반환되는 경우를 포함해 자원이 제대로 닫힘을 보장하는 수단으로 try-finally가 쓰였다. // 더 이상 자원을 회수하는 최선의 방책이 아니다. static String firstLineOfFile(String path) throws IOException { BufferedReader br = new BufferedReader(new FileReader(path)); try { return br.readLine(); } finally { br.close(); } } // 자원이 둘 이상이면...","categories": ["Java"],
        "tags": ["Effective Java"],
        "url": "http://localhost:4000/java/Effective-Java-%EC%95%84%EC%9D%B4%ED%85%9C-9-try-finally-try-with-resources/",
        "teaser": null
      }]
