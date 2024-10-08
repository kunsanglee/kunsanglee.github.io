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
        "excerpt":"정적 팩터리 메서드 new키워드로 생성하지 않고 객체 생성해서 반환하는 메서드다. // 필드가 private final이고 필드의 값을 수정하는 방법이 없기 때문에 불변 클래스다. public class MyNumber { public static final int ZERO = new MyNumber(0); // 여러 곳에서 사용하는 값을 캐싱. private final int number; // 생성자의 접근자를 private로 하여 외부에서...","categories": ["Effective Java"],
        "tags": ["Effective Java"],
        "url": "http://localhost:4000/effective%20java/Effective-Java-%EC%95%84%EC%9D%B4%ED%85%9C-1-%EC%83%9D%EC%84%B1%EC%9E%90-%EB%8C%80%EC%8B%A0-%EC%A0%95%EC%A0%81-%ED%8C%A9%ED%84%B0%EB%A6%AC-%EB%A9%94%EC%84%9C%EB%93%9C%EB%A5%BC-%EA%B3%A0%EB%A0%A4%ED%95%98%EB%9D%BC/",
        "teaser": null
      },{
        "title": "Effective Java - 아이템 2: 생성자에 매개변수가 많다면 빌더를 고려하라",
        "excerpt":"빌더패턴 이전에 사용하던 방식 점층적 생성자 패턴 정적 팩터리와 생성자에는 선택적 매개변수가 많을 때 적절히 대응하기 어렵다는 제약이 있다. // 점층적 생성자 패턴을 사용하는 클래스(선택적 매개변수가 많아서 생성자 또한 많다) public class NutritionFacts { private final int servingSize; // 필수 private final int servings; // 필수 private final int calories;...","categories": ["Effective Java"],
        "tags": ["Effective Java"],
        "url": "http://localhost:4000/effective%20java/Effective-Java-%EC%95%84%EC%9D%B4%ED%85%9C-2-%EC%83%9D%EC%84%B1%EC%9E%90%EC%97%90-%EB%A7%A4%EA%B0%9C%EB%B3%80%EC%88%98%EA%B0%80-%EB%A7%8E%EB%8B%A4%EB%A9%B4-%EB%B9%8C%EB%8D%94%EB%A5%BC-%EA%B3%A0%EB%A0%A4%ED%95%98%EB%9D%BC/",
        "teaser": null
      },{
        "title": "Effective Java - 아이템 3: private 생성자나 열거 타입으로 싱글턴임을 보증하라",
        "excerpt":"싱글턴(Singleton) 싱글턴이란 인스턴스를 오직 하나만 생성할 수 있는 클래스를 말한다. 싱글턴의 전형적인 예로는 무상태(stateless) 객체나 설계상 유일해야 하는 시스템 컴포넌트를 들 수 있다. 그러나 클래스를 싱글턴으로 만들면 이를 사용하는 클라이언트를 테스트하기 어려워질 수 있다. 싱글턴을 만드는 방식 3가지 공통점 두 방식 모두 생성자는 private로 감춰둔다. 유일한 인스턴스에 접근할 수 있는...","categories": ["Effective Java"],
        "tags": ["Effective Java"],
        "url": "http://localhost:4000/effective%20java/Effective-Java-%EC%95%84%EC%9D%B4%ED%85%9C-3-private-%EC%83%9D%EC%84%B1%EC%9E%90%EB%82%98-%EC%97%B4%EA%B1%B0-%ED%83%80%EC%9E%85%EC%9C%BC%EB%A1%9C-%EC%8B%B1%EA%B8%80%ED%84%B4%EC%9E%84%EC%9D%84-%EB%B3%B4%EC%A6%9D%ED%95%98%EB%9D%BC/",
        "teaser": null
      },{
        "title": "Effective Java - 아이템 4: 인스턴스화를 막으려거든 private 생성자를 사용하라",
        "excerpt":"정적 멤버만 담은 유틸리티 클래스는 인스턴스로 만들어 쓰려고 설계한게 아니다. 하지만 생성자를 명시하지 않으면(직접 작성한 생성자가 하나도 없는 경우) 컴파일러가 자동으로 기본 생성자를 만들어준다. 사용자는 이 생성자가 자동 생성된 것인지 구분할 수 없다. // 인스턴스로 만들 의도가 없는 유틸리티 클래스 public class MyUtility { // 생성자가 하나도 없기 때문에 컴파일러가...","categories": ["Effective Java"],
        "tags": ["Effective Java"],
        "url": "http://localhost:4000/effective%20java/Effective-Java-%EC%95%84%EC%9D%B4%ED%85%9C-4-%EC%9D%B8%EC%8A%A4%ED%84%B4%EC%8A%A4%ED%99%94%EB%A5%BC-%EB%A7%89%EC%9C%BC%EB%A0%A4%EA%B1%B0%EB%93%A0-private-%EC%83%9D%EC%84%B1%EC%9E%90%EB%A5%BC-%EC%82%AC%EC%9A%A9%ED%95%98%EB%9D%BC/",
        "teaser": null
      },{
        "title": "Effective Java - 아이템 5: 자원을 직접 명시하지 말고 의존 객체 주입을 사용하라",
        "excerpt":"// 정적 유틸리티를 잘못 사용한 예 - 유연하지 않고 테스트하기 어렵다. public class SpellChecker { private static final Lexicon dictionary = ...; private SpellChecker() {} // 객체 생성 방지 public static boolean isValid(String word) { ... } public static List&lt;String&gt; suggestions(String typo) { ... } } // 싱글턴을 잘못 사용한...","categories": ["Effective Java"],
        "tags": ["Effective Java"],
        "url": "http://localhost:4000/effective%20java/Effective-Java-%EC%95%84%EC%9D%B4%ED%85%9C-5-%EC%9E%90%EC%9B%90%EC%9D%84-%EC%A7%81%EC%A0%91-%EB%AA%85%EC%8B%9C%ED%95%98%EC%A7%80-%EB%A7%90%EA%B3%A0-%EC%9D%98%EC%A1%B4-%EA%B0%9D%EC%B2%B4-%EC%A3%BC%EC%9E%85%EC%9D%84-%EC%82%AC%EC%9A%A9%ED%95%98%EB%9D%BC/",
        "teaser": null
      },{
        "title": "Effective Java - 아이템 6: 불필요한 객체 생성을 피하라",
        "excerpt":"기존 객체를 재사용해야 한다면 새로운 객체를 만들지 마라 똑같은 기능의 객체를 매번 생성하기보다 불변 객체처럼 재사용하는 편이 낫다. // 절대로 String은 new 키워드로 생성하지 말자. new 키워드로 생성시 인스턴스를 새로 만든다. String s1 = \"hi\"; String s2 = new String(\"hi\"); 생성자 대신 정적 팩터리 메서드를 제공하는 불변 클래스에서는 정적 팩터리...","categories": ["Effective Java"],
        "tags": ["Effective Java"],
        "url": "http://localhost:4000/effective%20java/Effective-Java-%EC%95%84%EC%9D%B4%ED%85%9C-6-%EB%B6%88%ED%95%84%EC%9A%94%ED%95%9C-%EA%B0%9D%EC%B2%B4-%EC%83%9D%EC%84%B1%EC%9D%84-%ED%94%BC%ED%95%98%EB%9D%BC/",
        "teaser": null
      },{
        "title": "Effective Java - 아이템 7: 다 쓴 객체 참조를 해제하라",
        "excerpt":"메모리 누수가 있는 프로그램을 오래 실행하다 보면 점차 가비지 컬렉션 활동과 메모리 사용량이 늘어나 결국 성능이 저하된다. // 메모리 누수가 일어나는 코드 public class Stack { private Object[] elements; private int size = 0; private static final int DEFAULT_INITIAL_CAPACITY = 16; public Stack() { elements = new Object[DEFAULT_INITIAL_CAPACITY]; } public...","categories": ["Effective Java"],
        "tags": ["Effective Java"],
        "url": "http://localhost:4000/effective%20java/Effective-Java-%EC%95%84%EC%9D%B4%ED%85%9C-7-%EB%8B%A4-%EC%93%B4-%EA%B0%9D%EC%B2%B4-%EC%B0%B8%EC%A1%B0%EB%A5%BC-%ED%95%B4%EC%A0%9C%ED%95%98%EB%9D%BC/",
        "teaser": null
      },{
        "title": "Effective Java - 아이템 8: finalizer와 cleaner 사용을 피하라",
        "excerpt":"자바는 두 가지 객체 소멸자를 제공한다. finalizer는 예측할 수 없고, 상황에 따라 위험할 수 있어 일반적으로 불필요하다. 그래서 기본적으로 쓰지 말아야 한다. finalizer의 대안으로 나온cleaner는 finalizer보다는 덜 위험하지만, 여전히 예측할 수 없고, 느리고, 일반적으로 불필요하다. 자바의 finalizer, cleaner는 C++의 파괴자(destructor)와 다른 개념이다. C++에서 파괴자(생성자의 꼭 필요한 대척점)는 특정 객체와 관련된...","categories": ["Effective Java"],
        "tags": ["Effective Java"],
        "url": "http://localhost:4000/effective%20java/Effective-Java-%EC%95%84%EC%9D%B4%ED%85%9C-8-finalizer%EC%99%80-cleaner-%EC%82%AC%EC%9A%A9%EC%9D%84-%ED%94%BC%ED%95%98%EB%9D%BC/",
        "teaser": null
      },{
        "title": "Effective Java - 아이템 9: try-finally보다는 try-with-resources를 사용하라",
        "excerpt":"try-finally 전통적으로 예외가 발생하거나 메서드에서 반환되는 경우를 포함해 자원이 제대로 닫힘을 보장하는 수단으로 try-finally가 쓰였다. // 더 이상 자원을 회수하는 최선의 방책이 아니다. static String firstLineOfFile(String path) throws IOException { BufferedReader br = new BufferedReader(new FileReader(path)); try { return br.readLine(); } finally { br.close(); } } // 자원이 둘 이상이면...","categories": ["Effective Java"],
        "tags": ["Effective Java"],
        "url": "http://localhost:4000/effective%20java/Effective-Java-%EC%95%84%EC%9D%B4%ED%85%9C-9-try-finally-try-with-resources/",
        "teaser": null
      },{
        "title": "Effective Java - 아이템 10: equals는 일반 규약을 지켜 재정의하라",
        "excerpt":"equals를 재정의하지 않는 것이 좋은 상황 각 인스턴스가 본질적으로 고유하다. 값을 표현하는게 아니라 동작하는 개체를 표현하는 클래스. Thread가 좋은 예 인스턴스의 ‘논리적 동치성(logical equality)’을 검사할 일이 없다. 상위 클래스에서 재정의한 equals가 하위 클래스에도 딱 들어맞는다. 상위 클래스의 equals를 쓰면 되는데 굳이 하위 클래스에서 오버라이딩 하지 마라. 클래스가 private이거나 package-private이고 eqauls...","categories": ["Effective Java"],
        "tags": ["Effective Java"],
        "url": "http://localhost:4000/effective%20java/Effective-Java-%EC%95%84%EC%9D%B4%ED%85%9C-10-equals/",
        "teaser": null
      },{
        "title": "Effective Java - 아이템 11: equals를 재정의하려거든 hashCode도 재정의하라",
        "excerpt":"equals를 재정의한 클래스 모두에서 hashCode도 재정의해야 한다 재정의하지 않으면 일반 규약을 어기게 되어 HashMap, HashSet 같은 컬렉션의 원소로 사용할 때 문제를 일으킬 것이다. Object 명세 equals 비교에 사용되는 정보가 변경되지 않았다면, 애플리케이션이 실행되는 동안 그 객체의 hashCode 메서드는 몇 번을 호출해도 일관되게 항상 같은 값을 반환해야 한다. 단, 애플리케이션을 다시...","categories": ["Effective Java"],
        "tags": ["Effective Java"],
        "url": "http://localhost:4000/effective%20java/Effective-Java-Item-11-equals&hashCode/",
        "teaser": null
      },{
        "title": "Effective Java - 아이템 12: toString을 항상 재정의하라",
        "excerpt":"Object의 기본 toString은 PhoneNumber@adbbd 처럼 단순히 {클래스이름}@{16진수}로 표시한 해시코드를 반환할 뿐이다. toString의 일반 규약에 따르면 간결하면서 사람이 읽기 쉬운 형태의 유익한 정보를 반환해야 한다. toString의 규약 모든 하위 클래스에서 이 메서드를 재정의하라 toString을 잘 구현한 클래스와 시스템은 디버깅하기 쉽다. toString을 제대로 재정의하지 않는다면 쓸모없는 메시지만 로그에 남을 것이다. 실전에서 toString은...","categories": ["Effective Java"],
        "tags": ["Effective Java"],
        "url": "http://localhost:4000/effective%20java/Effective-Java-Item-12-toString/",
        "teaser": null
      },{
        "title": "Effective Java - 아이템 13: clone 재정의는 주의해서 진행하라",
        "excerpt":"Cloneable은 복제해도 되는 클래스임을 명시하는 용도의 믹스인 인터페이스(mixin interface)지만, 의도한 목적을 제대로 이루지 못했다. Cloneable 인터페이스는 무슨 일을 할까? 이 인터페이스는 Object의 protected 메서드인 clone의 동작 방식을 결정한다. Cloneable을 구현한 클래스의 인스턴스에서 clone을 호출하면 그 객체의 필드들을 하나하나 복사한 객체를 반환하며, 그렇지 않은 클래스의 인스턴스에서 호출하면 CloneNotSupportedException을 던진다. 실무에서 Cloneable을...","categories": ["Effective Java"],
        "tags": ["Effective Java"],
        "url": "http://localhost:4000/effective%20java/Effective-Java-Item-13-clone/",
        "teaser": null
      },{
        "title": "Effective Java - 아이템 14: Comparable을 구현할지 고려하라",
        "excerpt":"compareTo Comparable 인터페이스의 유일한 메서드인 compareTo는 단순 동치성 비교에 더해 순서까지 비교할 수 있으며, 제네릭하다. Comparable을 구현했다는 것은 그 클래스의 인스턴스들에는 자연적인 순서(natural order)가 있음을 뜻한다. 사실상 자바 플랫폼 라이브러리의 모든 값 클래스와 열거타입이 Comparable을 구현했다. 알파벳, 숫자, 연대 같이 순서가 명확한 값 클래스를 작성한다면 반드시 Comparable 인터페이스를 구현하자. public...","categories": ["Effective Java"],
        "tags": ["Effective Java"],
        "url": "http://localhost:4000/effective%20java/Effective-Java-Item-14-Comparable/",
        "teaser": null
      },{
        "title": "Effective Java - 아이템 15: 클래스와 멤버의 접근 권한을 최소화하라",
        "excerpt":"정보 은닉의 장점 시스템을 구성하는 컴포넌트들을 서로 독립시켜서 개발, 테스트, 최적화, 적용, 분석, 수정을 개별적으로 할 수 있게 해주는 것과 연관되어 있다. 시스템 개발 속도를 높인다. 여러 컴포넌트를 병렬로 개발할 수 있기 때문이다. 시스템 관리 비용을 낮춘다. 각 컴포넌트를 더 빨리 파악하여 디버깅 할 수 있고, 다른 컴포넌트로 교체하는 부담도...","categories": ["Effective Java"],
        "tags": ["Effective Java"],
        "url": "http://localhost:4000/effective%20java/Effective-Java-Item-15-%ED%81%B4%EB%9E%98%EC%8A%A4%EC%99%80-%EB%A9%A4%EB%B2%84%EC%9D%98-%EC%A0%91%EA%B7%BC%EA%B6%8C%ED%95%9C%EC%9D%84-%EC%B5%9C%EC%86%8C%ED%99%94%ED%95%98%EB%9D%BC/",
        "teaser": null
      },{
        "title": "Effective Java - 아이템 16: public 클래스에서는 public 필드가 아닌 접근자 메서드를 사용하라",
        "excerpt":"// 퇴보한 public 클래스 class Point { public double x; public double y; } // 데이터 필드에 직접 접근할 수 있으니 캡슐화의 이점을 제공하지 못한다. // API를 수정하지 않고는 내부 표현을 바꿀 수 없고, 불변식을 보장할 수 없으며, // 외부에서 필드에 접근할 때 부수 작업을 수행할 수도 없다. class Point...","categories": ["Effective Java"],
        "tags": ["Effective Java"],
        "url": "http://localhost:4000/effective%20java/Effective-Java-Item-16-public-class-field/",
        "teaser": null
      },{
        "title": "Effective Java - 아이템 17: 변경 가능성을 최소화하라",
        "excerpt":"불변 클래스 불변 클래스랄 간단히 말해 그 인스턴스의 내부 값을 수정할 수 없는 클래스다. 불변 인스턴스에 간직된 정보는 고정되어 객체가 파괴되는 순간까지 절대 달라지지 않는다. 불변 클래스는 가변 클래스보다 설계하고 구현하고 사용하기 쉬우며, 오류가 생길 여지도 적고 훨씬 안전하다. 불변 클래스를 만들기 위한 5가지 규칙 객체의 상태를 변경하는 메서드(변경자)를 제공하지...","categories": ["Effective Java"],
        "tags": ["Effective Java"],
        "url": "http://localhost:4000/effective%20java/Effective-Java-Item-17-%EB%B3%80%EA%B2%BD-%EA%B0%80%EB%8A%A5%EC%84%B1%EC%9D%84-%EC%B5%9C%EC%86%8C%ED%99%94%ED%95%98%EB%9D%BC/",
        "teaser": null
      },{
        "title": "Effective Java - 아이템 18: 상속보다는 컴포지션을 사용하라",
        "excerpt":"메서드 호출과 달리 상속은 캡슐화를 깨뜨린다. 상위 클래스가 어떻게 구현되느냐에 따라 상속하는 하위 클래스의 동작에 이상이 생길 수 있다. 상위 클래스는 릴리스마다 내부 구현이 달라질 수 있기 때문에, 코드 한 줄 수정하지 않은 하위 클래스에서 오동작 할 수 있다. 상속 클래스의 메서드 재정의에서 비롯된 문제 상위 클래스에서 정의한 메서드를 하위...","categories": ["Effective Java"],
        "tags": ["Effective Java"],
        "url": "http://localhost:4000/effective%20java/Effective-Java-Item-18-composition/",
        "teaser": null
      },{
        "title": "Effective Java - 아이템 19: 상속을 고려해 설계하고 문서화하라. 그러지 않았다면 상속을 금지하라",
        "excerpt":"상속을 고려한 설계와 문서화란? 상속용 클래스는 재정의할 수 있는 메서드들을 내부적으로 어떻게 이용하는지 문서로 남겨야 한다. ‘재정의 가능’이란 public과 protected 메서드 중 final이 아닌 모든 메서드를 뜻한다. API 문서의 메서드 설명 끝에서 종종 “Implementation Requirements”로 시작하는 그 메서드 내부 동작 방식을 설명하는 곳이 있는데, 메서드 주석에 @implSpec 태그를 붙여주면 자바독...","categories": ["Effective Java"],
        "tags": ["Effective Java"],
        "url": "http://localhost:4000/effective%20java/Effective-Java-Item-19-.extends/",
        "teaser": null
      },{
        "title": "Effective Java - 아이템 20: 추상 클래스보다는 인터페이스를 우선하라",
        "excerpt":"자바가 제공하는 다중 구현 메커니즘은 인터페이스와 추상 클래스, 이렇게 두 가지다. 자바 8부터 인터페이스도 디폴트 메서드(default method)를 제공할 수 있게 되어 이제는 두 메커니즘 모두 인스턴스 메서드를 구현 형태로 제공할 수 있다. 인터페이스와 추상 클래스의 차이 추상 클래스가 정의한 타입을 구현하는 클래스는 반드시 추상 클래스의 하위 클래스가 되어야 한다는 점이다....","categories": ["Effective Java"],
        "tags": ["Effective Java"],
        "url": "http://localhost:4000/effective%20java/Effective-Java-Item-20-abstract-class-interface/",
        "teaser": null
      },{
        "title": "Modern Java In Action - 동작 파라미터화 코드 전달하기",
        "excerpt":"동작 파라미터화(behavior parameterization)를 이용하면 자주 바뀌는 요구사항에 효과적으로 대응할 수 있다. 동작 파라미터화란 아직은 어떻게 실행할 것인지 결정하지 않은 코드 블록을 의미한다. 이 코드 블록은 나중에 프로그램에서 호출한다. 즉, 코드 블록의 실행은 나중으로 미뤄진다. 나중에 실행될 메서드의 인수로 코드 블록을 전달할 수 있다. // 녹색 사과 필터링 enum Color {...","categories": ["Modern Java In Action"],
        "tags": ["동작 파라미터화"],
        "url": "http://localhost:4000/modern%20java%20in%20action/behavior-parameterization/",
        "teaser": null
      },{
        "title": "Effective Java - 아이템 21: 인터페이스는 구현하는 쪽을 생각해 설계하라",
        "excerpt":"디폴트 메서드 디폴트 메서드(default method)를 선언하면, 그 인터페이스를 구현한 후 디폴트 메서드를 재정의하지 않은 모든 클래스에서 디폴트 구현이 쓰이게 된다. 디폴트 메서드는 구현 클래스에 대해 아무것도 모른 채 합의 없이 무작정 ‘삽입’될 뿐이다. 그로인해 생각할 수 있는 모든 상황에서 불변식을 해치지 않는 디폴트 메서드를 작성하기란 어려운 법이다. 디폴트 메서드의 위험성...","categories": ["Effective Java"],
        "tags": ["Effective Java"],
        "url": "http://localhost:4000/effective%20java/Effective-Java-Item-21-interface/",
        "teaser": null
      },{
        "title": "Effective Java - 아이템 22: 인터페이스는 타입을 정의하는 용도로만 사용하라",
        "excerpt":"인터페이스의 인터페이스는 자신을 구현한 클래스의 인스턴스를 참조할 수 있는 타입 역할을 한다. 달리 말해, 클래스가 어떤 인터페이스를 구현한다는 것은 자신의 인스턴스로 무엇을 할 수 있는지를 클라이언트에 얘기해주는 것이다. 인터페이스는 오직 이 용도로만 사용해야 한다. 안티패턴 인터페이스 사용 이 지침에 반하는 예로 상수 인터페이스라는 것이 있다. 상수 인터페이스란 메서드 없이, 상수를...","categories": ["Effective Java"],
        "tags": ["Effective Java"],
        "url": "http://localhost:4000/effective%20java/Effective-Java-Item-22-interface-for-type/",
        "teaser": null
      },{
        "title": "Modern Java In Action - 람다 표현식",
        "excerpt":"람다 표현식은 메서드로 전달할 수 있는 익명 함수를 단순화한 것이라고 할 수 있다. 익명: 보통의 메서드와 달리 이름이 없으므로 익명이라 표현한다. 함수: 람다는 메서드처럼 특정 클래스에 종속되지 않으므로 함수라 한다. 하지만 메서드처럼 파라미터 리스트, 바디, 반환 형식, 가능한 예외 리스트를 포함한다. 전달: 람다 표현식을 메서드 인수로 전달하거나 변수로 저장할 수...","categories": ["Modern Java In Action"],
        "tags": ["람다"],
        "url": "http://localhost:4000/modern%20java%20in%20action/lambda-expression/",
        "teaser": null
      },{
        "title": "Effective Java - 아이템 23: 태그 달린 클래스보다는 클래스 계층구조를 활용하라",
        "excerpt":"// 태그 달린 클래스 - 클래스 계층구조보다 훨씬 나쁘다 class Figure { enum Shape { RECTANGLE, CIRCLE }; // 태그 필드 - 현재 모양을 나타낸다. final Shape shape; // 다음 필드들은 모양이 사각형일 때만 쓰인다. double length; double width; // 다음 필드는 모양이 원일 때만 쓰인다. double radius; // 원용...","categories": ["Effective Java"],
        "tags": ["Effective Java"],
        "url": "http://localhost:4000/effective%20java/Effective-Java-Item-23-rather-than-tag-class/",
        "teaser": null
      },{
        "title": "Effective Java - 아이템 24: 멤버 클래스는 되도록 static으로 만들라",
        "excerpt":"중첩 클래스(nested class)란 다른 클래스 안에 정의된 클래스를 말한다. 중첩 클래스는 자신을 감싼 바깥 클래스에서만 쓰여야 하며, 그 외의 쓰임새가 있다면 톱레벨 클래스로 만들어야 한다. 중첩 클래스의 종류는 정적 멤버 클래스, (비정적) 멤버 클래스, 익명 클래스, 지역 클래스, 이렇게 네 가지다. 이 중 첫 번째를 제외한 나머지는 내부 클래스(inner class)에...","categories": ["Effective Java"],
        "tags": ["Effective Java"],
        "url": "http://localhost:4000/effective%20java/Effective-Java-Item-24-member-class-be-static/",
        "teaser": null
      },{
        "title": "Effective Java - 아이템 25: 로 타입은 사용하지 말라",
        "excerpt":"제네릭 클래스와 인터페이스 선언에 타입 매개변수(type parameter)가 쓰이면, 이를 제네릭 클래스 혹은 제네릭 인터페이스라 한다. 제네릭 클래스와 제네릭 인터페이스를 통틀어 제네릭 타입(generic type)이라 한다. 각각의 제네릭 타입은 일련의 매개변수화 타입(parameterized type)을 정의한다. 제네릭 타입을 하나 정의하면 그에 딸리 로 타입(raw type)도 함께 정의된다. 로 타입이란 제네릭 타입에서 타입 매개변수를 전혀...","categories": ["Effective Java"],
        "tags": ["Effective Java"],
        "url": "http://localhost:4000/effective%20java/Effective-Java-Item-26-generic-raw-type/",
        "teaser": null
      },{
        "title": "codeforces contest 첫 참가",
        "excerpt":"처음으로 참가한 대회 Pinely Round 4 (Div. 1 + Div. 2) 나는 ps를 이제 거의 처음 시작하는 초보라 A번 문제만 풀고 이후 문제는 이해하기 어려워서 진행하지 않았다. 내가 푼 문제는 A. Maximize the Last Element 라는 문제였다. 이 문제는 기본적으로 홀수개의 원소를 가진 배열을 준다. 그리고 원소가 딱 하나만 남을...","categories": ["ps"],
        "tags": ["codeforces"],
        "url": "http://localhost:4000/ps/code-force-first-contest/",
        "teaser": null
      },{
        "title": "행동대장 프로젝트",
        "excerpt":"우아한테크코스 6기 레벨3에는 팀 프로젝트를 진행하는데, 내가 속한 팀은 행동대장 팀이다. 우리 팀은 행사 주최자들에게 편리하게 행사를 주최하고 참여자들을 관리할 수 있는 핵심 가치를 전달해 주려고 했다. 그 과정에서 팀원들의 지인들에게 구글 설문폼을 만들어서 행사를 주최하는 입장과, 참여하는 입장에서 어떤 점이 불편한지, 어떤 점이 개선되었으면 하는지 응답을 받았다. 응답을 바탕으로...","categories": ["woowacourse"],
        "tags": ["project"],
        "url": "http://localhost:4000/woowacourse/%ED%96%89%EB%8F%99%EB%8C%80%EC%9E%A5-%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B8-2%EC%B0%A8-%EB%8D%B0%EB%AA%A8%EB%8D%B0%EC%9D%B4/",
        "teaser": null
      },{
        "title": "sql 파일 이용해서 데이터 저장하기",
        "excerpt":"얼마 전 우테코의 코치 토미가 인덱스 강의를 해주셨다. 아마 토미가 미리 만들어두신 것으로 추정되는 백만에 가까운 row가 들어있는 대용량의 데이터를 바탕으로 강의가 진행되었다. 원래 수업시간 외에 크루들에게 데이터를 제공할 계획이 없으셨으나, 무수한 백엔드 크루들의 성원에 못이기셨는지 학습 목적으로만 사용하는 것을 조건으로 제공해 주셨다. 고로 데이터를 외부에 절대 공유하지 않을 것이다....","categories": ["DB"],
        "tags": ["DB","linux","mysql","parallel"],
        "url": "http://localhost:4000/db/sql-%ED%8C%8C%EC%9D%BC-%EC%9D%B4%EC%9A%A9%ED%95%B4%EC%84%9C-%EB%8D%B0%EC%9D%B4%ED%84%B0-%EC%A0%80%EC%9E%A5/",
        "teaser": null
      },{
        "title": "행동대장을 정산 특화 서비스로 탈바꿈 하기 위한 아이디어",
        "excerpt":"정산을 위해 지출 내용을 직접 입력해야 된다는 것 자체가 엄청나게 큰 허들. 행사를 자주 주최하거나, 현재까지 정산에 큰 불편함을 느껴보지 않은 사용자라서 이런 허들 때문에 정산 기능이 뭐가 추가된다고 해도 안쓸 것 같다는 의견을 친구에게 들었다. 이 허들을 낮추기 위한 방법으로 토스처럼 지출 내역을 종합적으로 관리할 수 있는 마이 데이터...","categories": ["woowacourse"],
        "tags": ["project"],
        "url": "http://localhost:4000/woowacourse/%ED%96%89%EB%8F%99%EB%8C%80%EC%9E%A5-%EC%A0%95%EC%82%B0-%ED%8A%B9%ED%99%94-%EC%84%9C%EB%B9%84%EC%8A%A4%EB%A1%9C-%ED%83%88%EB%B0%94%EA%BF%88%EC%9D%84-%EC%9C%84%ED%95%9C-%EC%95%84%EC%9D%B4%EB%94%94%EC%96%B4/",
        "teaser": null
      },{
        "title": "org.hibernate.HibernateException: A collection with cascade=\"all-delete-orphan\" was no longer referenced by the owning entity instance 에러 트러블 슈팅",
        "excerpt":"org.hibernate.HibernateException: A collection with cascade=”all-delete-orphan” was no longer referenced by the owning entity instance 에러 트러블 슈팅한 내용이다. 지출 내역의 이름과 금액을 BillAction이라는 엔티티로 관리하고 있다. 예를 들어 민수, 철수, 영희 3명이 스타벅스에서 각각 아메리카노 1잔씩 마셨다고 가정하면, BillAction의 title에는 스타벅스, price는 15,000원을 저장한다. 그리고 하나의 지출 내역 BillAction은 해당...","categories": ["woowacourse"],
        "tags": ["project","JPA"],
        "url": "http://localhost:4000/woowacourse/A-collection-with-cascade=-all-delete-orphan-was-no-longer-referenced-by-the-owning-entity-instance-%EC%97%90%EB%9F%AC/",
        "teaser": null
      },{
        "title": "토미의 Coupon 인덱스 정리 - 1",
        "excerpt":"토미의 트랜잭션, 인덱스 강의 자료를 학습하여 작성했다. public class IndexPerformanceTest { private static final String BASE_URI = \"http://localhost:8080\"; private static final Long MIN_COUPON_ID = 1L; private static final Long MAX_COUPON_ID = 351160L; private static final Long MIN_MEMBER_ID = 1L; private static final Long MAX_MEMBER_ID = 250000L; private static final int...","categories": ["DB"],
        "tags": ["index","mysql"],
        "url": "http://localhost:4000/db/%ED%86%A0%EB%AF%B8%EC%9D%98-Coupon-%EC%9D%B8%EB%8D%B1%EC%8A%A4-%EC%A0%95%EB%A6%AC-1/",
        "teaser": null
      },{
        "title": "토미의 Coupon 인덱스 정리 - 2",
        "excerpt":"3번 문제 @Test void 현재_발급_가능한_쿠폰_조회() throws InterruptedException { AtomicBoolean running = new AtomicBoolean(false); AtomicInteger requestCount = new AtomicInteger(0); AtomicLong totalElapsedTime = new AtomicLong(0); int statusCode = RestAssured.get(\"/coupons/issuable\").statusCode(); assertThat(statusCode).withFailMessage(\"발급 가능한 쿠폰 조회 API 호출에 실패했습니다. 테스트 대상 서버가 실행중인지 확인해 주세요.\").isEqualTo(200); executeMultipleRequests(running, requestCount, totalElapsedTime, () -&gt; RestAssured.get(\"/coupons/issuable\")); System.out.println(\"Total request count: \"...","categories": ["DB"],
        "tags": ["index","mysql"],
        "url": "http://localhost:4000/db/%ED%86%A0%EB%AF%B8%EC%9D%98-Coupon-%EC%9D%B8%EB%8D%B1%EC%8A%A4-%EC%A0%95%EB%A6%AC-2/",
        "teaser": null
      },{
        "title": "토미의 Coupon 인덱스 정리 - 3",
        "excerpt":"4번 문제 회원이 가지고 있는 사용 가능한 쿠폰을 조회하는 API 이다. @Test void 회원이_가지고_있는_사용_가능한_쿠폰_조회() throws InterruptedException { AtomicBoolean running = new AtomicBoolean(false); AtomicInteger requestCount = new AtomicInteger(0); AtomicLong totalElapsedTime = new AtomicLong(0); int statusCode = RestAssured.get(\"/member-coupons/by-member-id?memberId=\" + ThreadLocalRandom.current() .nextLong(MIN_MEMBER_ID, MAX_MEMBER_ID + 1)).statusCode(); assertThat(statusCode).withFailMessage(\"회원이 가지고 있는 쿠폰 조회 API 호출에 실패했습니다....","categories": ["DB"],
        "tags": ["index","mysql"],
        "url": "http://localhost:4000/db/%ED%86%A0%EB%AF%B8%EC%9D%98-Coupon-%EC%9D%B8%EB%8D%B1%EC%8A%A4-%EC%A0%95%EB%A6%AC-3/",
        "teaser": null
      }]
